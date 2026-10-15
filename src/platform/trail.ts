import type { PlatformClient } from './client';
import type { LocationPoint } from './types';

const MAX_QUEUE = 200;          // the platform accepts 200 points per call
const MIN_GAP_MS = 10000;       // the platform saves one point per 5 s at most; 10 s is plenty for a route replay

/**
 * Sends the driver's GPS positions to the platform so the shop can replay the route later. Points are queued while the phone has
 * no signal and sent together when it does. The platform also samples positions itself, so a gap here never loses the whole trail.
 */
export class TrailReporter {
    private queue: LocationPoint[] = [];
    private lastAt = 0;
    private sending = false;

    constructor(private client: Pick<PlatformClient, 'location'>, private now: () => number = Date.now) {}

    get pending(): number {
        return this.queue.length;
    }

    /** Returns true if the point was accepted into the queue (not throttled). */
    push(lat: number, lng: number, at?: string | number | Date): boolean {
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return false;
        const t = this.now();
        if (t - this.lastAt < MIN_GAP_MS) return false;
        this.lastAt = t;
        this.queue.push({ lat, lng, at: new Date(at ?? t).toISOString() });
        if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
        void this.flush();
        return true;
    }

    /** Send everything queued. On failure the points stay queued for the next try. */
    async flush(): Promise<boolean> {
        if (this.sending || !this.queue.length) return false;
        this.sending = true;
        const batch = this.queue.slice();
        try {
            await this.client.location(batch);
            this.queue.splice(0, batch.length);
            return true;
        } catch {
            return false;
        } finally {
            this.sending = false;
        }
    }
}

let active: TrailReporter | null = null;

/** Called by PlatformProvider once the client exists (and with null when the driver disconnects). */
export function bindTrailReporter(reporter: TrailReporter | null) {
    active = reporter;
}

/** Called from the location callbacks. Does nothing until the platform is linked, and never throws. */
export function reportPosition(lat: number, lng: number, at?: string | number | Date) {
    try {
        active?.push(lat, lng, at);
    } catch {}
}
