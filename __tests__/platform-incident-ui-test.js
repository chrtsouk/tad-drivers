import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text as NativeText, Modal } from 'react-native';

const mockPlatform = { current: {} };
const mockCamera = jest.fn();

jest.mock('react-native-image-picker', () => ({ launchCamera: (...a) => mockCamera(...a) }));
jest.mock('@fortawesome/react-native-fontawesome', () => ({ FontAwesomeIcon: () => null }));
jest.mock('../src/utils/toast', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('../src/platform/PlatformContext', () => ({ usePlatform: () => mockPlatform.current }));
jest.mock('../src/components/SafeSpinner', () => ({ __esModule: true, default: () => null }));
jest.mock('tamagui', () => {
    const { Pressable, Text, View, TextInput } = require('react-native');
    const Button = ({ children, onPress, disabled }) => (
        <Pressable testID='button' onPress={disabled ? undefined : onPress} disabled={disabled}>
            {children}
        </Pressable>
    );
    Button.Text = Text;
    Button.Icon = ({ children }) => <>{children}</>;
    const theme = new Proxy({}, { get: () => ({ val: '#000' }) });
    return { Button, Text, XStack: View, YStack: View, TextArea: TextInput, useTheme: () => theme };
});

const ReportIncidentModal = require('../src/components/ReportIncidentModal').default;
const PlatformOrderInfo = require('../src/components/PlatformOrderInfo').default;
const { toast } = require('../src/utils/toast');
const { PlatformError } = require('../src/platform/errors');

const textOf = (root) => root.findAllByType(NativeText).map((n) => [n.props.children].flat(Infinity).join('')).join(' | ');
const button = (root, label) => root.findAll((n) => n.props.testID === 'button' && textOf(n).includes(label))[0];
const choose = (root, role, label) => root.findAll((n) => n.props.accessibilityRole === role && typeof n.props.onPress === 'function' && textOf(n).includes(label))[0];
const mounted = [];
const render = async (element) => {
    let r;
    await ReactTestRenderer.act(async () => (r = ReactTestRenderer.create(element)));
    mounted.push(r);
    return r;
};
afterEach(async () => {
    jest.clearAllMocks();
    await ReactTestRenderer.act(async () => mounted.splice(0).forEach((r) => r.unmount()));
});

const platform = (over = {}) => ({
    configured: true,
    run: { batch: { id: 1, status: 'out' }, orders: [{ id: 7, number: 'TAD-20261015-007', state: 'out', custom: [{ label: 'Gate code', value: '4321' }, { label: 'Spice level', value: 'Hot' }] }, { id: 8, number: 'TAD-20261015-008', state: 'out' }] },
    client: { incidentTypes: jest.fn(async () => ({ vehicle: 'Vehicle problem', other: 'Other' })), reportIncident: jest.fn(async () => ({ incident: { id: 1 } })) },
    ...over,
});

describe('ReportIncidentModal', () => {
    test('uses the shop\'s list of types, needs a type and a note, then sends type + note + order + photo', async () => {
        mockPlatform.current = platform();
        mockCamera.mockResolvedValue({ assets: [{ base64: '/9j/4AAQSkZJRg==' }] });
        const onClose = jest.fn();
        const r = await render(<ReportIncidentModal visible onClose={onClose} orderId={7} orderNumber='TAD-20261015-007' />);
        expect(textOf(r.root)).toContain('Report an incident - TAD-20261015-007');
        expect(textOf(r.root)).toContain('Vehicle problem');

        await ReactTestRenderer.act(async () => button(r.root, 'Send to the shop').props.onPress());
        expect(textOf(r.root)).toContain('Choose what kind of incident it is');
        expect(mockPlatform.current.client.reportIncident).not.toHaveBeenCalled();

        const vehicle = choose(r.root, 'radio', 'Vehicle problem');
        await ReactTestRenderer.act(async () => vehicle.props.onPress());
        await ReactTestRenderer.act(async () => button(r.root, 'Send to the shop').props.onPress());
        expect(textOf(r.root)).toContain('Write what happened');

        await ReactTestRenderer.act(async () => r.root.findAll((n) => n.props.placeholder === 'What happened?')[0].props.onChangeText('Flat tyre on Wandsworth Rd'));
        await ReactTestRenderer.act(async () => button(r.root, 'Add a photo').props.onPress());
        expect(textOf(r.root)).toContain('Photo added');
        await ReactTestRenderer.act(async () => button(r.root, 'Send to the shop').props.onPress());
        expect(mockPlatform.current.client.reportIncident).toHaveBeenCalledWith({ type: 'vehicle', note: 'Flat tyre on Wandsworth Rd', order_id: 7, photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' });
        expect(toast.success).toHaveBeenCalledWith('Incident sent to the shop');
        expect(onClose).toHaveBeenCalled();
    });

    test('opened from the profile (no order): can pick one of the run\'s orders; a refused send shows the shop\'s message and stays open', async () => {
        const client = { incidentTypes: jest.fn(async () => ({})), reportIncident: jest.fn(async () => { throw new PlatformError('That order is not on your run', 403, 'not_yours'); }) };
        mockPlatform.current = platform({ client });
        const onClose = jest.fn();
        const r = await render(<ReportIncidentModal visible onClose={onClose} />);
        expect(textOf(r.root)).toContain('Other');                       // falls back to the built-in list
        expect(textOf(r.root)).toContain('TAD-20261015-008');
        await ReactTestRenderer.act(async () => choose(r.root, 'radio', 'Safety concern').props.onPress());
        await ReactTestRenderer.act(async () => r.root.findAll((n) => n.props.placeholder === 'What happened?')[0].props.onChangeText('Unsafe street'));
        await ReactTestRenderer.act(async () => choose(r.root, 'checkbox', '008').props.onPress());
        await ReactTestRenderer.act(async () => button(r.root, 'Send to the shop').props.onPress());
        expect(client.reportIncident).toHaveBeenCalledWith({ type: 'safety', note: 'Unsafe street', order_id: 8 });
        expect(textOf(r.root)).toContain('That order is not on your run');
        expect(onClose).not.toHaveBeenCalled();
    });

    test('an oversized photo is refused before sending', async () => {
        mockPlatform.current = platform();
        mockCamera.mockResolvedValue({ assets: [{ base64: 'A'.repeat(4 * 1024 * 1024 + 8) }] });
        const r = await render(<ReportIncidentModal visible onClose={jest.fn()} orderId={7} />);
        await ReactTestRenderer.act(async () => choose(r.root, 'radio', 'Other').props.onPress());
        await ReactTestRenderer.act(async () => r.root.findAll((n) => n.props.placeholder === 'What happened?')[0].props.onChangeText('x'));
        await ReactTestRenderer.act(async () => button(r.root, 'Add a photo').props.onPress());
        await ReactTestRenderer.act(async () => button(r.root, 'Send to the shop').props.onPress());
        expect(textOf(r.root)).toContain('The photo is too big');
        expect(mockPlatform.current.client.reportIncident).not.toHaveBeenCalled();
    });
});

describe('PlatformOrderInfo', () => {
    test('shows the shop\'s custom fields for an order on the run and offers the incident button', async () => {
        mockPlatform.current = platform();
        const r = await render(<PlatformOrderInfo order={{ id: 'fb_1' }} />);
        expect(r.toJSON()).toBeNull();                                    // not a platform order: nothing shown
    });
    test('matches the order by its Fleetbase id', async () => {
        const p = platform();
        p.run.orders[0].fleetbase_order_id = 'order_abc';
        mockPlatform.current = p;
        const r = await render(<PlatformOrderInfo order={{ id: 'order_abc' }} />);
        expect(textOf(r.root)).toContain('Gate code: ');
        expect(textOf(r.root)).toContain('4321');
        expect(textOf(r.root)).toContain('Spice level: ');
        expect(button(r.root, 'Report an incident')).toBeTruthy();
        expect(r.root.findAllByType(Modal)[0].props.visible).toBe(false);
        await ReactTestRenderer.act(async () => button(r.root, 'Report an incident').props.onPress());
        expect(r.root.findAllByType(Modal)[0].props.visible).toBe(true);
    });
});
