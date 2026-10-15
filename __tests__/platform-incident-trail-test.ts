import { createPlatformClient, FetchLike } from '../src/platform/client';
import { DEFAULT_INCIDENT_TYPES, buildIncidentPayload } from '../src/platform/incident';
import { TrailReporter, bindTrailReporter, reportPosition } from '../src/platform/trail';

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/';
const ok = (body: unknown = {}) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

function client(fetchImpl: FetchLike) {
    return createPlatformClient({ getBaseUrl: () => 'https://shop.example.com', getToken: () => 'tok', fetchImpl });
}

describe('incident payload', () => {
    test('needs a known type and a note', () => {
        expect(buildIncidentPayload({ type: null, note: 'x' })).toEqual({ ok: false, error: 'Choose what kind of incident it is' });
        expect(buildIncidentPayload({ type: 'nope', note: 'x' }).ok).toBe(false);
        expect(buildIncidentPayload({ type: 'vehicle', note: '   ' })).toEqual({ ok: false, error: 'Write what happened' });
        expect(buildIncidentPayload({ type: 'vehicle', note: 'a'.repeat(1001) }).ok).toBe(false);
    });
    test('builds the body, trims the note, adds the order and a JPEG data URL', () => {
        const r = buildIncidentPayload({ type: 'customer_conduct', note: '  Shouted at me ', orderId: 7, photo: JPEG.replace('data:image/jpeg;base64,', '') });
        expect(r).toEqual({ ok: true, payload: { type: 'customer_conduct', note: 'Shouted at me', order_id: 7, photo: JPEG } });
        expect(buildIncidentPayload({ type: 'vehicle', note: 'Flat tyre' })).toEqual({ ok: true, payload: { type: 'vehicle', note: 'Flat tyre' } });
    });
    test('refuses a photo that is not a JPEG or is over 3 MB', () => {
        expect(buildIncidentPayload({ type: 'other', note: 'x', photo: 'data:image/png;base64,AAAA' }).ok).toBe(false);
        const big = 'A'.repeat(4 * 1024 * 1024 + 8);
        expect(buildIncidentPayload({ type: 'other', note: 'x', photo: big })).toEqual({ ok: false, error: 'The photo is too big (3 MB at most). Take it again.' });
    });
    test('accepts the platform-supplied list of types', () => {
        expect(buildIncidentPayload({ type: 'dog', note: 'x' }, { dog: 'Dog' }).ok).toBe(true);
        expect(Object.keys(DEFAULT_INCIDENT_TYPES)).toContain('accident');
    });
});

describe('platform client: location and incidents', () => {
    test('location posts the points; incident types and report use the driver routes', async () => {
        const calls: Array<{ url: string; method: string; body?: string }> = [];
        const c = client(jest.fn(async (url, init) => {
            calls.push({ url, method: init.method, body: init.body });
            return ok(url.endsWith('incident-types') ? { types: { other: 'Other' } } : url.endsWith('location') ? { ok: true, kept: 2 } : { incident: { id: 9 } });
        }) as any);
        expect((await c.location([{ lat: 1, lng: 2, at: 'a' }, { lat: 3, lng: 4 }])).kept).toBe(2);
        expect(await c.incidentTypes()).toEqual({ other: 'Other' });
        expect((await c.reportIncident({ type: 'other', note: 'n', order_id: 4 })).incident.id).toBe(9);
        expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual(['POST https://shop.example.com/driver/location', 'GET https://shop.example.com/driver/incident-types', 'POST https://shop.example.com/driver/incidents']);
        expect(JSON.parse(calls[0].body!)).toEqual({ points: [{ lat: 1, lng: 2, at: 'a' }, { lat: 3, lng: 4 }] });
        expect(JSON.parse(calls[2].body!)).toEqual({ type: 'other', note: 'n', order_id: 4 });
    });
});

describe('TrailReporter', () => {
    const setup = () => {
        let t = 1_000_000;
        const sent: any[][] = [];
        let fail = false;
        const reporter = new TrailReporter({ location: async (pts: any[]) => { if (fail) throw new Error('offline'); sent.push(pts); return { ok: true, kept: pts.length }; } } as any, () => t);
        return { reporter, sent, advance: (ms: number) => { t += ms; }, setFail: (v: boolean) => { fail = v; } };
    };
    const flushed = () => new Promise((r) => setImmediate(r));

    test('sends a point, throttles ones that are too close in time, ignores bad fixes', async () => {
        const s = setup();
        expect(s.reporter.push(51.5, -0.1, '2026-10-15T10:00:00.000Z')).toBe(true);
        await flushed();
        expect(s.sent[0]).toEqual([{ lat: 51.5, lng: -0.1, at: '2026-10-15T10:00:00.000Z' }]);
        s.advance(3000);
        expect(s.reporter.push(51.5, -0.1)).toBe(false);
        expect(s.reporter.push(0, 0)).toBe(false);
        expect(s.reporter.push(NaN, 1)).toBe(false);
        s.advance(8000);
        expect(s.reporter.push(51.51, -0.11)).toBe(true);
    });

    test('keeps points while offline and sends them together later; never queues more than 200', async () => {
        const s = setup();
        s.setFail(true);
        for (let i = 0; i < 3; i++) { s.advance(11000); s.reporter.push(51 + i / 100, 0.1); await flushed(); }
        expect(s.reporter.pending).toBe(3);
        expect(s.sent).toHaveLength(0);
        s.setFail(false);
        s.advance(11000); s.reporter.push(52, 0.1); await flushed();
        expect(s.sent).toHaveLength(1);
        expect(s.sent[0]).toHaveLength(4);
        expect(s.reporter.pending).toBe(0);

        s.setFail(true);
        for (let i = 0; i < 230; i++) { s.advance(11000); s.reporter.push(51, 0.1 + i / 1000); }
        await flushed();
        expect(s.reporter.pending).toBe(200);
    });

    test('reportPosition does nothing until a reporter is bound, then forwards, and never throws', async () => {
        expect(() => reportPosition(51, 0)).not.toThrow();
        const s = setup();
        bindTrailReporter(s.reporter);
        reportPosition(51.2, -0.2, 1_700_000_000_000);
        await flushed();
        expect(s.sent[0][0]).toMatchObject({ lat: 51.2, lng: -0.2 });
        bindTrailReporter(null);
        reportPosition(51.3, -0.3);
        expect(s.reporter.pending).toBe(0);
    });
});
