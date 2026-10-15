import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Modal, Text as NativeText, TextInput } from 'react-native';
import HapticFeedback from 'react-native-haptic-feedback';

const mockNavigation = { navigate: jest.fn() };
const mockPlatform = { current: {} };

jest.mock('@react-navigation/native', () => ({
    useNavigation: () => mockNavigation,
    useFocusEffect: (effect) => require('react').useEffect(effect, [effect]),
}));
jest.mock('react-native-haptic-feedback', () => ({ __esModule: true, default: { trigger: jest.fn() } }));
jest.mock('@fortawesome/react-native-fontawesome', () => ({ FontAwesomeIcon: () => null }));
jest.mock('../src/utils/toast', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('../src/platform/PlatformContext', () => ({ usePlatform: () => mockPlatform.current }));
jest.mock('../src/components/Input', () => {
    const { TextInput } = require('react-native');
    return { __esModule: true, default: TextInput };
});
jest.mock('../src/components/Content', () => ({ SectionHeader: () => null }));
jest.mock('../src/components/QrCodeScanner', () => {
    const { View } = require('react-native');
    return { __esModule: true, default: (props) => <View testID='scanner' {...props} /> };
});
jest.mock('tamagui', () => {
    const { Pressable, Text, View } = require('react-native');
    const Button = ({ children, onPress, disabled }) => (
        <Pressable testID='button' onPress={disabled ? undefined : onPress} disabled={disabled}>
            {children}
        </Pressable>
    );
    Button.Text = Text;
    Button.Icon = ({ children }) => <>{children}</>;
    const theme = new Proxy({}, { get: () => ({ val: '#000' }) });
    return { Button, Text, XStack: View, YStack: View, useTheme: () => theme, TextArea: View };
});

const ClockInCard = require('../src/components/ClockInCard').default;
const CollectOrdersScreen = require('../src/screens/CollectOrdersScreen').default;
const { PlatformError } = require('../src/platform/errors');

const textOf = (root) =>
    root
        .findAllByType(NativeText)
        .map((n) => [n.props.children].flat(Infinity).join(''))
        .join(' | ');
const button = (root, label) => root.findAll((n) => n.props.testID === 'button' && textOf(n).includes(label))[0];
const press = (root, label) => button(root, label);

const mounted = [];
const render = async (element) => {
    let r;
    await ReactTestRenderer.act(async () => (r = ReactTestRenderer.create(element)));
    mounted.push(r);
    return r;
};

beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(async () => {
    await ReactTestRenderer.act(async () => mounted.splice(0).forEach((r) => r.unmount()));
});

describe('ClockInCard', () => {
    const base = (over) => ({ configured: true, tokenRefused: false, me: { clocked_in: false, since: null, zone: null }, meError: null, clockIn: jest.fn(async () => ({ ok: true })), clockOut: jest.fn(async () => ({ ok: true })), refreshMe: jest.fn(), ...over });

    test('asks to link the platform when there is no token', async () => {
        mockPlatform.current = base({ configured: false, me: null });
        const r = await render(<ClockInCard />);
        expect(textOf(r.root)).toContain('Link the TAD platform');
        await ReactTestRenderer.act(async () => press(r.root, 'Open TAD platform settings').props.onPress());
        expect(mockNavigation.navigate).toHaveBeenCalledWith('DriverAccountTab', { screen: 'PlatformSettings' });
    });

    test('clock in sends the zone', async () => {
        mockPlatform.current = base();
        const r = await render(<ClockInCard zone='north' />);
        expect(textOf(r.root)).toContain('OFF SHIFT');
        await ReactTestRenderer.act(async () => press(r.root, 'Clock in').props.onPress());
        expect(mockPlatform.current.clockIn).toHaveBeenCalledWith('north');
    });

    test('shows the running shift timer when clocked in', async () => {
        jest.useFakeTimers().setSystemTime(Date.parse('2026-10-15T20:00:05Z'));
        try {
            mockPlatform.current = base({ me: { clocked_in: true, since: '2026-10-15T18:00:00.000Z', zone: null } });
            const r = await render(<ClockInCard />);
            expect(textOf(r.root)).toContain('ON SHIFT');
            expect(textOf(r.root)).toContain('2:00:05');
            await ReactTestRenderer.act(async () => jest.advanceTimersByTime(3000));
            expect(textOf(r.root)).toContain('2:00:08');
        } finally {
            jest.useRealTimers();
        }
    });

    test('clock out refused mid-run shows "Finish your current run first"', async () => {
        mockPlatform.current = base({ me: { clocked_in: true, since: '2026-10-15T18:00:00.000Z', zone: null }, clockOut: jest.fn(async () => ({ ok: false, message: 'Finish your current run first' })) });
        const r = await render(<ClockInCard />);
        await ReactTestRenderer.act(async () => press(r.root, 'Clock out').props.onPress());
        expect(textOf(r.root)).toContain('Finish your current run first');
        expect(require('../src/utils/toast').toast.error).toHaveBeenCalledWith('Finish your current run first');
    });
});

describe('CollectOrdersScreen', () => {
    const A = 'TAD-20261015-007';
    const B = 'TAD-20261015-008';
    const run = () => ({ batch: { id: 1, status: 'assigned' }, orders: [{ id: 1, number: A, state: 'assigned', stop_seq: 1, picked_at: null, name: 'Sam', postcode: 'N1' }, { id: 2, number: B, state: 'assigned', stop_seq: 2, picked_at: null, name: 'Al', postcode: 'N2' }] });

    function setup(scan) {
        const client = { run: jest.fn(async () => run()), scan: jest.fn(scan), startRun: jest.fn(async () => ({ run: {} })) };
        mockPlatform.current = { client, configured: true, tokenRefused: false, refreshRun: jest.fn() };
        return client;
    }

    test('wrong bag: red full-screen message from the server, haptic, camera blocked until OK', async () => {
        const client = setup(async () => {
            throw new PlatformError('Wrong bag — order TAD-20261015-099 is not on your run', 409, 'wrong_bag');
        });
        const r = await render(<CollectOrdersScreen />);
        expect(textOf(r.root)).toContain('0 of 2 bags scanned');
        expect(r.root.findByType(Modal).props.visible).toBe(false);

        await ReactTestRenderer.act(async () => r.root.findByProps({ testID: 'scanner' }).props.onScan({ value: 'TAD|TAD-20261015-099' }));
        expect(r.root.findByType(Modal).props.visible).toBe(true);
        expect(textOf(r.root)).toContain('Wrong bag — order TAD-20261015-099 is not on your run');
        expect(HapticFeedback.trigger).toHaveBeenCalledWith('notificationError', expect.anything());

        await ReactTestRenderer.act(async () => r.root.findByProps({ testID: 'scanner' }).props.onScan({ value: 'TAD|TAD-20261015-099' }));
        expect(client.scan).toHaveBeenCalledTimes(1);

        await ReactTestRenderer.act(async () => r.root.findAllByProps({ accessibilityLabel: 'Dismiss wrong bag warning' })[0].props.onPress());
        expect(r.root.findByType(Modal).props.visible).toBe(false);
    });

    test('correct bags tick off, Start run stays disabled until all are scanned, manual entry works', async () => {
        const left = [A, B];
        const client = setup(async ({ code }) => {
            const n = code.slice(4);
            left.splice(left.indexOf(n), 1);
            return { ok: true, order: n, remaining: [...left], all_scanned: left.length === 0 };
        });
        client.scan.mockImplementation(async (code) => {
            const n = code.slice(4);
            left.splice(left.indexOf(n), 1);
            return { ok: true, order: n, remaining: [...left], all_scanned: left.length === 0 };
        });
        const r = await render(<CollectOrdersScreen />);
        expect(button(r.root, 'Start run').props.disabled).toBe(true);
        expect(client.startRun).not.toHaveBeenCalled();

        await ReactTestRenderer.act(async () => r.root.findByProps({ testID: 'scanner' }).props.onScan({ value: `TAD|${A}` }));
        expect(textOf(r.root)).toContain('1 of 2 bags scanned');
        expect(textOf(r.root)).toContain(`${A} is the right bag`);

        await ReactTestRenderer.act(async () => r.root.findByType(TextInput).props.onChangeText('20261015-008'));
        await ReactTestRenderer.act(async () => press(r.root, 'Check').props.onPress());
        expect(client.scan).toHaveBeenLastCalledWith(`TAD|${B}`);
        expect(textOf(r.root)).toContain('2 of 2 bags scanned');

        expect(button(r.root, 'Start run').props.disabled).toBe(false);
        await ReactTestRenderer.act(async () => press(r.root, 'Start run').props.onPress());
        expect(client.startRun).toHaveBeenCalledTimes(1);
        expect(textOf(r.root)).toContain('Run started');
        await ReactTestRenderer.act(async () => press(r.root, 'Open my orders').props.onPress());
        expect(mockNavigation.navigate).toHaveBeenCalledWith('DriverTaskTab', { screen: 'DriverOrderManagement' });
    });

    test('no run waiting shows a calm message and no scanner', async () => {
        const client = setup(async () => ({}));
        client.run.mockResolvedValue({ batch: null, orders: [], next_run_waiting: false });
        const r = await render(<CollectOrdersScreen />);
        expect(textOf(r.root)).toContain('No orders waiting for you');
        expect(r.root.findAllByProps({ testID: 'scanner' })).toHaveLength(0);
    });
});
