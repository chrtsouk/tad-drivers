import { PlatformError, ON_A_RUN_MESSAGE } from './errors';
import type { DriverMe, DriverRun, PlatformMessage, ScanResult, Shift } from './types';

export interface ResponseLike {
    ok: boolean;
    status: number;
    text(): Promise<string>;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: unknown }) => Promise<ResponseLike>;

export interface PlatformClientOptions {
    /** Called on every request so a settings change takes effect immediately. */
    getBaseUrl: () => string | null | undefined;
    getToken: () => string | null | undefined;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
}

/** Trim, drop trailing slashes, require http(s). Returns null when it is not a usable URL. */
export function normalizeBaseUrl(input: string | null | undefined): string | null {
    const trimmed = String(input ?? '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(trimmed)) return null;
    return trimmed;
}

const DEFAULT_TIMEOUT_MS = 15000;

export function createPlatformClient(options: PlatformClientOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
        const base = normalizeBaseUrl(options.getBaseUrl());
        const token = String(options.getToken() ?? '').trim();
        if (!base) throw new PlatformError('The TAD platform address is not set. Open Account > TAD platform.', 0, 'not_configured');
        if (!token) throw new PlatformError('The TAD driver token is not set. Open Account > TAD platform.', 0, 'not_configured');

        const fetchImpl: FetchLike = options.fetchImpl ?? ((globalThis as any).fetch as FetchLike);
        const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
        const init: { method: string; headers: Record<string, string>; body?: string; signal?: unknown } = { method, headers };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(body);
        }

        const Controller = (globalThis as any).AbortController;
        const controller = Controller ? new Controller() : null;
        if (controller) init.signal = controller.signal;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                controller?.abort();
                reject(new PlatformError('The shop did not answer in time. Check your signal and try again.', 0, 'timeout'));
            }, timeoutMs);
        });

        let response: ResponseLike;
        try {
            response = await Promise.race([fetchImpl(`${base}${path}`, init), timeout]);
        } catch (err) {
            if (err instanceof PlatformError) throw err;
            throw new PlatformError('Could not reach the shop. Check your signal and try again.', 0, 'network');
        } finally {
            if (timer) clearTimeout(timer);
        }

        let text = '';
        try {
            text = await response.text();
        } catch {
            text = '';
        }
        let data: any = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = null;
            }
        }

        if (!response.ok) {
            const code = typeof data?.code === 'string' ? data.code : response.status === 401 ? 'unauthorised' : 'error';
            let message = typeof data?.error === 'string' && data.error ? data.error : `The shop returned an error (${response.status}).`;
            if (code === 'on_a_run') message = ON_A_RUN_MESSAGE;
            if (response.status === 401) message = 'The driver token was refused. Ask the shop for a new one.';
            throw new PlatformError(message, response.status, code);
        }
        if (data === null) throw new PlatformError('The shop sent a reply the app could not read.', response.status, 'bad_response');
        return data as T;
    }

    return {
        me: () => request<DriverMe>('GET', '/driver/me'),
        clockIn: (zone?: string | null) => request<{ shift: Shift }>('POST', '/driver/clock-in', zone ? { zone } : {}),
        clockOut: () => request<{ shift: Shift }>('POST', '/driver/clock-out', {}),
        run: () => request<DriverRun>('GET', '/driver/run'),
        scan: (code: string) => request<ScanResult>('POST', '/driver/scan', { code }),
        /** Deliberately has no `force` option: the app never overrides the bag check. */
        startRun: () => request<{ run: unknown }>('POST', '/driver/run/start', {}),
        delivered: (orderId: number) => request<{ order: unknown }>('POST', `/driver/orders/${encodeURIComponent(String(orderId))}/delivered`, {}),
        failed: (orderId: number, payload: { reason: string; photo?: string }) => request<{ order: unknown }>('POST', `/driver/orders/${encodeURIComponent(String(orderId))}/failed`, payload),
        notifications: async (): Promise<PlatformMessage[]> => (await request<{ messages: PlatformMessage[] }>('GET', '/driver/notifications')).messages ?? [],
        markRead: (ids: number[]) => request<{ ok: boolean }>('POST', '/driver/notifications/read', { ids }),
    };
}

export type PlatformClient = ReturnType<typeof createPlatformClient>;
