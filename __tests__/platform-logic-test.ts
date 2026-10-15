import { formatShiftTimer, parseServerTime } from '../src/platform/shift';
import { buildFailedPayload, base64Bytes, MAX_PHOTO_BYTES, FAIL_REASONS } from '../src/platform/failure';
import { findPlatformOrder, canReportDrop } from '../src/platform/deliveries';
import { NotificationPoller, isActionable, POLL_INTERVAL_MS } from '../src/platform/notifications';
import { validateSettingsInput, maskToken, loadSettings, saveSettings, clearToken, isConfigured, SettingsStore } from '../src/platform/settings';
import { PlatformError } from '../src/platform/errors';
import type { PlatformMessage } from '../src/platform/types';

describe('shift timer', () => {
    const t0 = Date.parse('2026-10-15T18:00:00Z');
    test('formats elapsed time', () => {
        expect(formatShiftTimer('2026-10-15T18:00:00.000Z', t0 + (3 * 3600 + 5 * 60 + 9) * 1000)).toBe('3:05:09');
        expect(formatShiftTimer('2026-10-15T18:00:00.000Z', t0)).toBe('0:00:00');
    });
    test('never negative, and tolerates missing or bad input', () => {
        expect(formatShiftTimer('2026-10-15T18:00:10Z', t0)).toBe('0:00:00');
        expect(formatShiftTimer(null, t0)).toBe('0:00:00');
        expect(formatShiftTimer('garbage', t0)).toBe('0:00:00');
    });
    test('a zone-less timestamp is UTC, not local time', () => {
        expect(parseServerTime('2026-10-15 18:00:00')).toBe(t0);
        expect(parseServerTime('2026-10-15T18:00:00')).toBe(t0);
        expect(parseServerTime('2026-10-15T19:00:00+01:00')).toBe(t0);
    });
});

describe('failed delivery payload', () => {
    const tinyJpeg = '/9j/4AAQSkZJRg==';
    test('lists the four reasons', () => {
        expect(FAIL_REASONS.map((r) => r.label)).toEqual(['No answer', 'Wrong address', 'Customer refused', 'Other']);
    });
    test('needs a reason', () => {
        expect(buildFailedPayload({ reason: null })).toEqual({ ok: false, error: 'Choose why the delivery failed' });
    });
    test('"Other" needs text; the others take optional text', () => {
        expect(buildFailedPayload({ reason: 'other', text: '  ' })).toMatchObject({ ok: false });
        expect(buildFailedPayload({ reason: 'other', text: 'Dog in garden' })).toEqual({ ok: true, payload: { reason: 'Other: Dog in garden' } });
        expect(buildFailedPayload({ reason: 'no_answer' })).toEqual({ ok: true, payload: { reason: 'No answer' } });
        expect(buildFailedPayload({ reason: 'wrong_address', text: 'No. 12 not found' })).toEqual({ ok: true, payload: { reason: 'Wrong address: No. 12 not found' } });
    });
    test('photo becomes a JPEG data URL', () => {
        expect(buildFailedPayload({ reason: 'no_answer', photo: tinyJpeg })).toEqual({ ok: true, payload: { reason: 'No answer', photo: `data:image/jpeg;base64,${tinyJpeg}` } });
        const already = `data:image/jpeg;base64,${tinyJpeg}`;
        expect(buildFailedPayload({ reason: 'no_answer', photo: already })).toMatchObject({ ok: true, payload: { photo: already } });
    });
    test('refuses non-JPEG and photos over 3 MB', () => {
        expect(buildFailedPayload({ reason: 'no_answer', photo: 'data:image/png;base64,AAAA' })).toEqual({ ok: false, error: 'The photo must be a JPEG' });
        const big = 'A'.repeat(Math.ceil(((MAX_PHOTO_BYTES + 10) * 4) / 3));
        expect(base64Bytes(big)).toBeGreaterThan(MAX_PHOTO_BYTES);
        expect(buildFailedPayload({ reason: 'no_answer', photo: big })).toMatchObject({ ok: false });
        const ok = 'A'.repeat(Math.floor(((MAX_PHOTO_BYTES - 10) * 4) / 3 / 4) * 4);
        expect(buildFailedPayload({ reason: 'no_answer', photo: ok })).toMatchObject({ ok: true });
    });
    test('base64Bytes accounts for padding', () => {
        expect(base64Bytes('QQ==')).toBe(1);
        expect(base64Bytes('QUI=')).toBe(2);
        expect(base64Bytes('QUJD')).toBe(3);
    });
});

describe('deliveries', () => {
    const run = { batch: { id: 1, status: 'out' }, orders: [{ id: 9, number: 'TAD-20261015-001', state: 'out', stop_seq: 1, picked_at: 'x', fleetbase_order_id: 'order_abc' }, { id: 10, number: 'TAD-20261015-002', state: 'delivered', stop_seq: 2, picked_at: 'x', fleetbase_order_id: null }] };
    test('finds the platform order for a Fleetbase order', () => {
        expect(findPlatformOrder(run, 'order_abc')?.id).toBe(9);
        expect(findPlatformOrder(run, 'order_zzz')).toBeNull();
        expect(findPlatformOrder(null, 'order_abc')).toBeNull();
        expect(findPlatformOrder(run, undefined)).toBeNull();
    });
    test('only orders that are out can be reported', () => {
        expect(canReportDrop(run.orders[0])).toBe(true);
        expect(canReportDrop(run.orders[1])).toBe(false);
        expect(canReportDrop(null)).toBe(false);
    });
});

describe('notification poller', () => {
    const msg = (id: number, kind: string): PlatformMessage => ({ id, kind, title: kind, at: 'now' });
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('only run_ready and pickup_next are actionable', () => {
        expect(isActionable(msg(1, 'run_ready'))).toBe(true);
        expect(isActionable(msg(2, 'pickup_next'))).toBe(true);
        expect(isActionable(msg(3, 'order_moved'))).toBe(false);
    });

    test('polls immediately and every 20 s, shows each message once, marks all read', async () => {
        const batches = [[msg(1, 'run_ready'), msg(2, 'something_else')], [msg(1, 'run_ready')], [msg(3, 'pickup_next')]];
        const client = { notifications: jest.fn(async () => batches.shift() ?? []), markRead: jest.fn(async () => ({ ok: true })) };
        const shown: number[][] = [];
        const poller = new NotificationPoller({ client, onNew: (m) => shown.push(m.map((x) => x.id)) });
        poller.start();
        await jest.advanceTimersByTimeAsync(0);
        expect(client.notifications).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
        expect(client.notifications).toHaveBeenCalledTimes(2);
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
        expect(client.notifications).toHaveBeenCalledTimes(3);
        expect(shown).toEqual([[1], [3]]);
        expect(client.markRead).toHaveBeenNthCalledWith(1, [1, 2]);
        expect(client.markRead).toHaveBeenCalledTimes(2);
        poller.stop();
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
        expect(client.notifications).toHaveBeenCalledTimes(3);
    });

    test('a failed mark-read does not show the message twice', async () => {
        const client = { notifications: jest.fn(async () => [msg(7, 'run_ready')]), markRead: jest.fn(async () => { throw new PlatformError('offline', 0, 'network'); }) };
        const onNew = jest.fn();
        const poller = new NotificationPoller({ client, onNew });
        await poller.pollNow();
        await poller.pollNow();
        expect(onNew).toHaveBeenCalledTimes(1);
    });

    test('pollNow (app foreground) works without the timer; overlapping polls are skipped', async () => {
        let release: () => void = () => {};
        const client = { notifications: jest.fn(() => new Promise<PlatformMessage[]>((res) => { release = () => res([]); })), markRead: jest.fn() };
        const poller = new NotificationPoller({ client: client as any, onNew: jest.fn() });
        const a = poller.pollNow();
        const b = poller.pollNow();
        release();
        await Promise.all([a, b]);
        expect(client.notifications).toHaveBeenCalledTimes(1);
    });

    test('network errors are swallowed and polling continues', async () => {
        const client = { notifications: jest.fn().mockRejectedValueOnce(new PlatformError('x', 0, 'network')).mockResolvedValue([msg(5, 'run_ready')]), markRead: jest.fn(async () => ({ ok: true })) };
        const onNew = jest.fn();
        const poller = new NotificationPoller({ client, onNew });
        poller.start();
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 5);
        expect(onNew).toHaveBeenCalledTimes(1);
        poller.stop();
    });

    test('a refused token stops polling and tells the app', async () => {
        const client = { notifications: jest.fn().mockRejectedValue(new PlatformError('no', 401, 'unauthorised')), markRead: jest.fn() };
        const onAuthError = jest.fn();
        const poller = new NotificationPoller({ client, onNew: jest.fn(), onAuthError });
        poller.start();
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
        expect(onAuthError).toHaveBeenCalledTimes(1);
        expect(client.notifications).toHaveBeenCalledTimes(1);
        expect(poller.running).toBe(false);
    });
});

describe('platform settings', () => {
    function memoryStore(init: { url?: string | null; token?: string | null } = {}): SettingsStore & { data: { url: string | null; token: string | null } } {
        const data = { url: init.url ?? null, token: init.token ?? null };
        return {
            data,
            getUrl: async () => data.url,
            setUrl: async (v) => { data.url = v; },
            getToken: async () => data.token,
            setToken: async (v) => { data.token = v; },
            clearToken: async () => { data.token = null; },
        };
    }

    test('validation', () => {
        expect(validateSettingsInput({ baseUrl: 'nope', token: '' })).toEqual({ ok: false, errors: { baseUrl: expect.any(String), token: expect.any(String) } });
        expect(validateSettingsInput({ baseUrl: 'https://a.example.com/', token: 'has space' })).toMatchObject({ ok: false, errors: { token: expect.any(String) } });
        expect(validateSettingsInput({ baseUrl: ' https://a.example.com/ ', token: ' drv_abc ' })).toEqual({ ok: true, value: { baseUrl: 'https://a.example.com', token: 'drv_abc' } });
    });

    test('masks the token', () => {
        expect(maskToken('drv_0123456789abcdef')).toBe('drv_••••ef');
        expect(maskToken('short')).toBe('••••');
        expect(maskToken(null)).toBe('');
    });

    test('load falls back to the build-config URL; saved URL wins', async () => {
        expect(await loadSettings(memoryStore(), 'https://default.example.com/')).toEqual({ baseUrl: 'https://default.example.com', token: null });
        expect(await loadSettings(memoryStore({ url: 'https://mine.example.com', token: 't' }), 'https://default.example.com')).toEqual({ baseUrl: 'https://mine.example.com', token: 't' });
        expect(await loadSettings(memoryStore(), '')).toEqual({ baseUrl: null, token: null });
    });

    test('save stores both; an invalid save stores nothing', async () => {
        const store = memoryStore();
        expect((await saveSettings(store, { baseUrl: 'x', token: 'y' })).ok).toBe(false);
        expect(store.data).toEqual({ url: null, token: null });
        expect((await saveSettings(store, { baseUrl: 'https://a.example.com/', token: 'drv_1' })).ok).toBe(true);
        expect(store.data).toEqual({ url: 'https://a.example.com', token: 'drv_1' });
        expect(isConfigured(await loadSettings(store))).toBe(true);
        await clearToken(store);
        expect(isConfigured(await loadSettings(store))).toBe(false);
        expect(store.data.url).toBe('https://a.example.com');
    });
});
