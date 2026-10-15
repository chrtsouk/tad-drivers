import { PlatformError, errorMessage } from './errors';
import type { PlatformClient } from './client';
import type { DriverRun, ScanResult } from './types';

export const QR_PREFIX = 'TAD|';
const ORDER_NUMBER = /^TAD-\d{8}-\d{3,}$/;

export type ParsedCode = { ok: true; number: string; code: string } | { ok: false; reason: 'empty' | 'bad_code' };

/**
 * Accepts what the bag QR holds (`TAD|TAD-20261015-007`) and what a driver types by hand
 * (`TAD-20261015-007` or just `20261015-007`). Always yields the exact QR payload the platform expects.
 */
export function parseBagCode(input: unknown): ParsedCode {
    let text = String(input ?? '').trim().toUpperCase();
    if (!text) return { ok: false, reason: 'empty' };
    if (text.startsWith(QR_PREFIX)) text = text.slice(QR_PREFIX.length);
    else if (/^\d{8}-\d{3,}$/.test(text)) text = `TAD-${text}`;
    if (!ORDER_NUMBER.test(text)) return { ok: false, reason: 'bad_code' };
    return { ok: true, number: text, code: `${QR_PREFIX}${text}` };
}

export type ScanPhase = 'idle' | 'loading' | 'ready' | 'checking' | 'starting' | 'started' | 'error';

export interface ScanAlert {
    kind: 'wrong_bag' | 'bad_code' | 'error';
    message: string;
}

export interface ScanState {
    phase: ScanPhase;
    run: DriverRun | null;
    /** Order numbers on this run whose bag has been scanned. */
    scanned: string[];
    remaining: string[];
    lastScanned: string | null;
    alert: ScanAlert | null;
    /** Filled when the platform refuses to start the run because bags are missing. */
    missing: string[];
    error: string | null;
}

export const initialScanState: ScanState = { phase: 'idle', run: null, scanned: [], remaining: [], lastScanned: null, alert: null, missing: [], error: null };

export function deriveFromRun(run: DriverRun): Pick<ScanState, 'scanned' | 'remaining'> {
    const scanned = run.orders.filter((o) => o.picked_at).map((o) => o.number);
    const remaining = run.orders.filter((o) => !o.picked_at).map((o) => o.number);
    return { scanned, remaining };
}

/** "Start run" is only possible when the run is waiting and every bag has been checked. */
export function canStartRun(state: ScanState): boolean {
    return state.phase === 'ready' && state.run?.batch?.status === 'assigned' && state.run.orders.length > 0 && state.remaining.length === 0;
}

type Listener = (state: ScanState) => void;

/**
 * The state machine behind the "Collect orders" screen. Not tied to React: the screen subscribes to it,
 * tests drive it with a mocked platform client.
 */
export class ScanSession {
    private state: ScanState = initialScanState;
    private listeners = new Set<Listener>();
    private inFlight = false;

    constructor(private client: Pick<PlatformClient, 'run' | 'scan' | 'startRun'>) {}

    getState = (): ScanState => this.state;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private set(patch: Partial<ScanState>): void {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach((l) => l(this.state));
    }

    async load(): Promise<void> {
        this.set({ phase: 'loading', error: null });
        try {
            const run = await this.client.run();
            const started = run.batch?.status === 'out';
            this.set({ phase: started ? 'started' : 'ready', run, ...deriveFromRun(run), alert: null, missing: [], error: null });
        } catch (err) {
            this.set({ phase: 'error', error: errorMessage(err) });
        }
    }

    /** `raw` is a camera QR value or what the driver typed. Returns true when the platform accepted the bag. */
    async scan(raw: unknown): Promise<boolean> {
        if (this.inFlight || this.state.phase === 'starting' || this.state.phase === 'started') return false;
        if (this.state.alert) return false; // a red "Wrong bag" screen is up: ignore the camera until it is dismissed
        const parsed = parseBagCode(raw);
        if (!parsed.ok) {
            if (parsed.reason === 'bad_code') this.set({ alert: { kind: 'bad_code', message: 'That is not a Texas After Dark bag label' } });
            return false;
        }
        this.inFlight = true;
        const previous = this.state.phase;
        this.set({ phase: 'checking' });
        try {
            const result: ScanResult = await this.client.scan(parsed.code);
            this.applyScan(result, parsed.number);
            return true;
        } catch (err) {
            this.set({ phase: previous === 'checking' ? 'ready' : previous, alert: alertFor(err) });
            return false;
        } finally {
            this.inFlight = false;
        }
    }

    private applyScan(result: ScanResult, number: string): void {
        const run = this.state.run;
        const remaining = result.remaining ?? [];
        const scanned = run ? run.orders.map((o) => o.number).filter((n) => !remaining.includes(n)) : [number];
        const updatedRun = run ? { ...run, orders: run.orders.map((o) => (remaining.includes(o.number) ? o : { ...o, picked_at: o.picked_at ?? new Date().toISOString() })) } : run;
        this.set({ phase: 'ready', run: updatedRun, scanned, remaining, lastScanned: result.order ?? number, alert: null, missing: [] });
    }

    dismissAlert(): void {
        this.set({ alert: null });
    }

    /** POST /driver/run/start. There is no override: if bags are missing the platform says which and we show them. */
    async start(): Promise<boolean> {
        if (!canStartRun(this.state)) return false;
        this.set({ phase: 'starting', error: null });
        try {
            await this.client.startRun();
            this.set({ phase: 'started', missing: [] });
            return true;
        } catch (err) {
            if (err instanceof PlatformError && err.code === 'bags_not_scanned') {
                const missing = parseMissing(err.message);
                this.set({ phase: 'ready', missing, remaining: missing.length ? missing : this.state.remaining, error: err.message });
            } else {
                this.set({ phase: 'ready', error: errorMessage(err) });
            }
            return false;
        }
    }
}

function alertFor(err: unknown): ScanAlert {
    if (err instanceof PlatformError) {
        if (err.code === 'wrong_bag') return { kind: 'wrong_bag', message: err.message };
        if (err.code === 'bad_code') return { kind: 'bad_code', message: err.message };
    }
    return { kind: 'error', message: errorMessage(err) };
}

/** The platform message is "Scan these bags first: TAD-..., TAD-..." */
export function parseMissing(message: string): string[] {
    return message.match(/TAD-\d{8}-\d{3,}/g) ?? [];
}
