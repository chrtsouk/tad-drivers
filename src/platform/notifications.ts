import type { PlatformClient } from './client';
import { isPlatformError } from './errors';
import type { PlatformMessage } from './types';

export const POLL_INTERVAL_MS = 20000;

/** Only these kinds are shown to the driver (banner + local notification). Everything else is just marked read. */
export const ACTIONABLE_KINDS = ['run_ready', 'pickup_next'] as const;

export function isActionable(message: PlatformMessage): boolean {
    return (ACTIONABLE_KINDS as readonly string[]).includes(message.kind);
}

export function fallbackTitle(kind: string): string {
    return kind === 'pickup_next' ? 'Pick up your orders' : 'Your next orders are ready';
}

export interface PollerOptions {
    client: Pick<PlatformClient, 'notifications' | 'markRead'>;
    /** Called once per new actionable message, oldest first. */
    onNew: (messages: PlatformMessage[]) => void;
    onAuthError?: () => void;
    intervalMs?: number;
}

/**
 * Polls GET /driver/notifications every 20 s (and on demand, e.g. when the app returns to the foreground),
 * surfaces new "run_ready" / "pickup_next" messages once, then marks everything it saw as read.
 */
export class NotificationPoller {
    private timer: ReturnType<typeof setInterval> | null = null;
    private busy = false;
    private seen = new Set<number>();

    constructor(private options: PollerOptions) {}

    start(): void {
        if (this.timer) return;
        void this.pollNow();
        this.timer = setInterval(() => void this.pollNow(), this.options.intervalMs ?? POLL_INTERVAL_MS);
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    get running(): boolean {
        return this.timer !== null;
    }

    async pollNow(): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        try {
            const messages = await this.options.client.notifications();
            const fresh = messages.filter((m) => !this.seen.has(m.id));
            if (fresh.length === 0) return;
            const actionable = fresh.filter(isActionable).sort((a, b) => a.id - b.id);
            fresh.forEach((m) => this.seen.add(m.id));
            if (actionable.length) this.options.onNew(actionable);
            try {
                await this.options.client.markRead(fresh.map((m) => m.id));
            } catch {
                // already remembered in `seen`; the platform will offer them again next time and they are skipped
            }
        } catch (err) {
            if (isPlatformError(err) && err.isUnauthorised) {
                this.stop();
                this.options.onAuthError?.();
            }
        } finally {
            this.busy = false;
        }
    }
}
