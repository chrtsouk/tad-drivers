import { createPlatformClient, normalizeBaseUrl, FetchLike } from '../src/platform/client';
import { PlatformError } from '../src/platform/errors';

function reply(status: number, body: unknown) {
    return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
}

function setup(responses: Array<ReturnType<typeof reply> | Error>, opts: { token?: string | null; url?: string | null; timeoutMs?: number } = {}) {
    const calls: Array<{ url: string; init: any }> = [];
    const queue = [...responses];
    const fetchImpl: FetchLike = jest.fn(async (url, init) => {
        calls.push({ url, init });
        const next = queue.shift();
        if (next instanceof Error) throw next;
        return next ?? reply(200, {});
    });
    const client = createPlatformClient({
        getBaseUrl: () => (opts.url === undefined ? 'https://drivers.example.com/' : opts.url),
        getToken: () => (opts.token === undefined ? 'drv_secret' : opts.token),
        fetchImpl,
        timeoutMs: opts.timeoutMs,
    });
    return { client, calls, fetchImpl };
}

describe('normalizeBaseUrl', () => {
    test('trims, removes trailing slashes, keeps http(s)', () => {
        expect(normalizeBaseUrl('  https://x.example.com// ')).toBe('https://x.example.com');
        expect(normalizeBaseUrl('http://192.168.1.5:3000')).toBe('http://192.168.1.5:3000');
    });
    test('rejects things that are not URLs', () => {
        expect(normalizeBaseUrl('')).toBeNull();
        expect(normalizeBaseUrl('drivers.example.com')).toBeNull();
        expect(normalizeBaseUrl('ftp://x.example.com')).toBeNull();
        expect(normalizeBaseUrl('https://has space.com')).toBeNull();
        expect(normalizeBaseUrl(null)).toBeNull();
    });
});

describe('platform client', () => {
    test('sends Authorization: Bearer on every call and builds the right URL', async () => {
        const { client, calls } = setup([reply(200, { driver_id: 'd1', clocked_in: false, since: null, zone: null })]);
        const me = await client.me();
        expect(me.clocked_in).toBe(false);
        expect(calls[0].url).toBe('https://drivers.example.com/driver/me');
        expect(calls[0].init.method).toBe('GET');
        expect(calls[0].init.headers.Authorization).toBe('Bearer drv_secret');
        expect(calls[0].init.body).toBeUndefined();
    });

    test('clock-in sends the zone only when given', async () => {
        const { client, calls } = setup([reply(200, { shift: {} }), reply(200, { shift: {} })]);
        await client.clockIn('north');
        await client.clockIn();
        expect(JSON.parse(calls[0].init.body)).toEqual({ zone: 'north' });
        expect(JSON.parse(calls[1].init.body)).toEqual({});
        expect(calls[0].url).toBe('https://drivers.example.com/driver/clock-in');
        expect(calls[0].init.headers['Content-Type']).toBe('application/json');
    });

    test('clock-out 409 on_a_run becomes "Finish your current run first"', async () => {
        const { client } = setup([reply(409, { error: 'Finish your current run before you clock out', code: 'on_a_run' })]);
        await expect(client.clockOut()).rejects.toMatchObject({ name: 'PlatformError', status: 409, code: 'on_a_run', message: 'Finish your current run first' });
    });

    test('scan posts the code; wrong_bag keeps the server message and code', async () => {
        const { client, calls } = setup([reply(409, { error: 'Wrong bag — order TAD-20261015-009 is not on your run', code: 'wrong_bag' })]);
        const err: PlatformError = await client.scan('TAD|TAD-20261015-009').catch((e) => e);
        expect(err).toBeInstanceOf(PlatformError);
        expect(err.code).toBe('wrong_bag');
        expect(err.message).toContain('Wrong bag');
        expect(JSON.parse(calls[0].init.body)).toEqual({ code: 'TAD|TAD-20261015-009' });
    });

    test('scan 422 bad_code', async () => {
        const { client } = setup([reply(422, { error: 'That is not a Texas After Dark bag label', code: 'bad_code' })]);
        await expect(client.scan('x')).rejects.toMatchObject({ status: 422, code: 'bad_code' });
    });

    test('startRun never sends force', async () => {
        const { client, calls } = setup([reply(200, { run: { id: 1 } })]);
        await client.startRun();
        expect(calls[0].url).toBe('https://drivers.example.com/driver/run/start');
        expect(JSON.parse(calls[0].init.body)).toEqual({});
    });

    test('startRun 409 bags_not_scanned surfaces the platform message', async () => {
        const { client } = setup([reply(409, { error: 'Scan these bags first: TAD-20261015-007', code: 'bags_not_scanned' })]);
        await expect(client.startRun()).rejects.toMatchObject({ code: 'bags_not_scanned', message: 'Scan these bags first: TAD-20261015-007' });
    });

    test('delivered and failed hit the order routes', async () => {
        const { client, calls } = setup([reply(200, { order: {} }), reply(200, { order: {} })]);
        await client.delivered(42);
        await client.failed(42, { reason: 'No answer', photo: 'data:image/jpeg;base64,AAAA' });
        expect(calls[0].url).toBe('https://drivers.example.com/driver/orders/42/delivered');
        expect(calls[1].url).toBe('https://drivers.example.com/driver/orders/42/failed');
        expect(JSON.parse(calls[1].init.body)).toEqual({ reason: 'No answer', photo: 'data:image/jpeg;base64,AAAA' });
    });

    test('notifications returns the messages array; markRead posts ids', async () => {
        const { client, calls } = setup([reply(200, { messages: [{ id: 3, kind: 'run_ready' }] }), reply(200, { ok: true })]);
        expect(await client.notifications()).toEqual([{ id: 3, kind: 'run_ready' }]);
        await client.markRead([3, 4]);
        expect(calls[1].url).toBe('https://drivers.example.com/driver/notifications/read');
        expect(JSON.parse(calls[1].init.body)).toEqual({ ids: [3, 4] });
    });

    test('401 becomes an unauthorised error', async () => {
        const { client } = setup([reply(401, { error: 'Driver sign-in needed', code: 'unauthorised' })]);
        const err: PlatformError = await client.me().catch((e) => e);
        expect(err.isUnauthorised).toBe(true);
    });

    test('network failure becomes a status-0 error', async () => {
        const { client } = setup([new Error('Network request failed')]);
        const err: PlatformError = await client.run().catch((e) => e);
        expect(err).toBeInstanceOf(PlatformError);
        expect(err.isNetwork).toBe(true);
        expect(err.code).toBe('network');
    });

    test('times out', async () => {
        jest.useFakeTimers();
        try {
            const fetchImpl: FetchLike = () => new Promise(() => {});
            const client = createPlatformClient({ getBaseUrl: () => 'https://x.example.com', getToken: () => 't', fetchImpl, timeoutMs: 1000 });
            const pending = client.me().catch((e) => e);
            await jest.advanceTimersByTimeAsync(1001);
            const err = await pending;
            expect(err).toMatchObject({ code: 'timeout', status: 0 });
        } finally {
            jest.useRealTimers();
        }
    });

    test('refuses to call without settings, and does not touch the network', async () => {
        const noToken = setup([], { token: '' });
        await expect(noToken.client.me()).rejects.toMatchObject({ code: 'not_configured' });
        const noUrl = setup([], { url: 'nonsense' });
        await expect(noUrl.client.me()).rejects.toMatchObject({ code: 'not_configured' });
        expect(noToken.fetchImpl).not.toHaveBeenCalled();
        expect(noUrl.fetchImpl).not.toHaveBeenCalled();
    });

    test('a non-JSON success reply is an error, not undefined data', async () => {
        const { client } = setup([reply(200, '<html>proxy</html>')]);
        await expect(client.me()).rejects.toMatchObject({ code: 'bad_response' });
    });

    test('reads settings on each call (a new token takes effect at once)', async () => {
        let token = 'one';
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (_u, init) => {
            calls.push(init.headers.Authorization);
            return reply(200, { driver_id: 'd', clocked_in: false, since: null, zone: null });
        };
        const client = createPlatformClient({ getBaseUrl: () => 'https://x.example.com', getToken: () => token, fetchImpl });
        await client.me();
        token = 'two';
        await client.me();
        expect(calls).toEqual(['Bearer one', 'Bearer two']);
    });
});
