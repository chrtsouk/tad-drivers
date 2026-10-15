import { ScanSession, parseBagCode, canStartRun, parseMissing } from '../src/platform/scanFlow';
import { createPlatformClient, FetchLike } from '../src/platform/client';
import type { DriverRun } from '../src/platform/types';

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

const A = 'TAD-20261015-007';
const B = 'TAD-20261015-008';

const order = (number: string, picked: string | null = null, id = 1) => ({ id, number, state: 'assigned', stop_seq: id, picked_at: picked, name: 'N', address: 'A', postcode: 'P' });

function makeRun(picked: string[] = []): DriverRun {
    return { batch: { id: 5, status: 'assigned' }, orders: [order(A, picked.includes(A) ? 'x' : null, 1), order(B, picked.includes(B) ? 'x' : null, 2)], next_run_waiting: false };
}

/** A fake platform: routes by URL, records calls, uses the real client. */
function fakePlatform(handlers: Record<string, (body: any) => ReturnType<typeof reply>>) {
    const calls: Array<{ path: string; body: any }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
        const path = url.replace('https://p.example.com', '');
        const body = init.body ? JSON.parse(init.body) : undefined;
        calls.push({ path, body });
        const h = handlers[`${init.method} ${path}`];
        if (!h) return reply(404, { error: 'No such API route', code: 'not_found' });
        return h(body);
    };
    const client = createPlatformClient({ getBaseUrl: () => 'https://p.example.com', getToken: () => 't', fetchImpl });
    return { client, calls };
}

describe('parseBagCode', () => {
    test('accepts the exact QR payload', () => {
        expect(parseBagCode(`TAD|${A}`)).toEqual({ ok: true, number: A, code: `TAD|${A}` });
    });
    test('manual entry: with or without the TAD- prefix, any case, spaces', () => {
        expect(parseBagCode(` ${A.toLowerCase()} `)).toMatchObject({ ok: true, code: `TAD|${A}` });
        expect(parseBagCode('20261015-007')).toMatchObject({ ok: true, code: `TAD|${A}` });
    });
    test('rejects other QR codes and junk', () => {
        expect(parseBagCode('https://example.com')).toEqual({ ok: false, reason: 'bad_code' });
        expect(parseBagCode('TAD|nonsense')).toEqual({ ok: false, reason: 'bad_code' });
        expect(parseBagCode('TAD|TAD-2026-7')).toEqual({ ok: false, reason: 'bad_code' });
        expect(parseBagCode('   ')).toEqual({ ok: false, reason: 'empty' });
        expect(parseBagCode(undefined)).toEqual({ ok: false, reason: 'empty' });
    });
});

describe('ScanSession', () => {
    test('load puts the run in ready state with remaining bags', async () => {
        const { client } = fakePlatform({ 'GET /driver/run': () => reply(200, makeRun()) });
        const s = new ScanSession(client);
        await s.load();
        expect(s.getState()).toMatchObject({ phase: 'ready', remaining: [A, B], scanned: [] });
        expect(canStartRun(s.getState())).toBe(false);
    });

    test('load resumes a half-scanned run', async () => {
        const { client } = fakePlatform({ 'GET /driver/run': () => reply(200, makeRun([A])) });
        const s = new ScanSession(client);
        await s.load();
        expect(s.getState()).toMatchObject({ scanned: [A], remaining: [B] });
    });

    test('a run already out goes straight to started', async () => {
        const run = makeRun();
        run.batch!.status = 'out';
        const { client } = fakePlatform({ 'GET /driver/run': () => reply(200, run) });
        const s = new ScanSession(client);
        await s.load();
        expect(s.getState().phase).toBe('started');
    });

    test('load error leaves a readable message', async () => {
        const { client } = fakePlatform({ 'GET /driver/run': () => reply(500, { error: 'Something went wrong on our side', code: 'error' }) });
        const s = new ScanSession(client);
        await s.load();
        expect(s.getState()).toMatchObject({ phase: 'error', error: 'Something went wrong on our side' });
    });

    test('scanning every bag enables Start run, then start works', async () => {
        const remaining = [A, B];
        const { client, calls } = fakePlatform({
            'GET /driver/run': () => reply(200, makeRun()),
            'POST /driver/scan': (body) => {
                const n = body.code.slice(4);
                remaining.splice(remaining.indexOf(n), 1);
                return reply(200, { ok: true, order: n, remaining: [...remaining], all_scanned: remaining.length === 0 });
            },
            'POST /driver/run/start': () => reply(200, { run: { id: 5, status: 'out' } }),
        });
        const s = new ScanSession(client);
        await s.load();
        expect(await s.scan(`TAD|${A}`)).toBe(true);
        expect(s.getState()).toMatchObject({ scanned: [A], remaining: [B], lastScanned: A, alert: null });
        expect(canStartRun(s.getState())).toBe(false);
        expect(await s.start()).toBe(false); // cannot start early, and no request is made
        expect(calls.some((c) => c.path === '/driver/run/start')).toBe(false);
        await s.scan(B); // manual entry of the number only
        expect(calls.filter((c) => c.path === '/driver/scan').map((c) => c.body.code)).toEqual([`TAD|${A}`, `TAD|${B}`]);
        expect(canStartRun(s.getState())).toBe(true);
        expect(await s.start()).toBe(true);
        expect(s.getState().phase).toBe('started');
        expect(calls.find((c) => c.path === '/driver/run/start')!.body).toEqual({});
    });

    test('wrong bag raises a red alert with the server message and blocks further scans until dismissed', async () => {
        const { client, calls } = fakePlatform({
            'GET /driver/run': () => reply(200, makeRun()),
            'POST /driver/scan': () => reply(409, { error: 'Wrong bag — order TAD-20261015-099 is not on your run', code: 'wrong_bag' }),
        });
        const s = new ScanSession(client);
        await s.load();
        expect(await s.scan('TAD|TAD-20261015-099')).toBe(false);
        expect(s.getState().alert).toEqual({ kind: 'wrong_bag', message: 'Wrong bag — order TAD-20261015-099 is not on your run' });
        expect(s.getState().phase).toBe('ready');
        expect(s.getState().remaining).toEqual([A, B]);
        // the camera keeps seeing the QR: no second request while the red screen is up
        await s.scan('TAD|TAD-20261015-099');
        expect(calls.filter((c) => c.path === '/driver/scan')).toHaveLength(1);
        s.dismissAlert();
        expect(s.getState().alert).toBeNull();
    });

    test('server 422 bad_code is shown as bad_code', async () => {
        const { client } = fakePlatform({
            'GET /driver/run': () => reply(200, makeRun()),
            'POST /driver/scan': () => reply(422, { error: 'That is not a Texas After Dark bag label', code: 'bad_code' }),
        });
        const s = new ScanSession(client);
        await s.load();
        await s.scan(`TAD|${A}`);
        expect(s.getState().alert).toEqual({ kind: 'bad_code', message: 'That is not a Texas After Dark bag label' });
    });

    test('a foreign QR never reaches the platform', async () => {
        const { client, calls } = fakePlatform({ 'GET /driver/run': () => reply(200, makeRun()) });
        const s = new ScanSession(client);
        await s.load();
        expect(await s.scan('https://evil.example.com')).toBe(false);
        expect(s.getState().alert?.kind).toBe('bad_code');
        expect(calls.filter((c) => c.path === '/driver/scan')).toHaveLength(0);
    });

    test('concurrent scans of the same QR make one request', async () => {
        let resolve: (v: any) => void = () => {};
        const gate = new Promise((r) => (resolve = r));
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url, init) => {
            if (url.endsWith('/driver/run')) return reply(200, makeRun());
            calls.push(url);
            await gate;
            return reply(200, { ok: true, order: A, remaining: [B], all_scanned: false });
        };
        const client = createPlatformClient({ getBaseUrl: () => 'https://p.example.com', getToken: () => 't', fetchImpl });
        const s = new ScanSession(client);
        await s.load();
        const first = s.scan(`TAD|${A}`);
        const second = s.scan(`TAD|${A}`);
        resolve(null);
        expect(await second).toBe(false);
        expect(await first).toBe(true);
        expect(calls).toHaveLength(1);
    });

    test('start 409 bags_not_scanned lists the missing bags and offers no override', async () => {
        const { client, calls } = fakePlatform({
            'GET /driver/run': () => reply(200, makeRun([A, B])), // the app thinks all are scanned
            'POST /driver/run/start': () => reply(409, { error: `Scan these bags first: ${B}`, code: 'bags_not_scanned' }),
        });
        const s = new ScanSession(client);
        await s.load();
        expect(canStartRun(s.getState())).toBe(true);
        expect(await s.start()).toBe(false);
        expect(s.getState()).toMatchObject({ phase: 'ready', missing: [B], remaining: [B], error: `Scan these bags first: ${B}` });
        expect(canStartRun(s.getState())).toBe(false);
        expect(calls.every((c) => !(c.body && 'force' in c.body))).toBe(true);
    });

    test('subscribers are notified of every change and can unsubscribe', async () => {
        const { client } = fakePlatform({ 'GET /driver/run': () => reply(200, makeRun()) });
        const s = new ScanSession(client);
        const seen: string[] = [];
        const off = s.subscribe((st) => seen.push(st.phase));
        await s.load();
        off();
        s.dismissAlert();
        expect(seen).toEqual(['loading', 'ready']);
    });
});

test('parseMissing pulls order numbers from the platform message', () => {
    expect(parseMissing('Scan these bags first: TAD-20261015-007, TAD-20261015-008')).toEqual(['TAD-20261015-007', 'TAD-20261015-008']);
    expect(parseMissing('nothing here')).toEqual([]);
});
