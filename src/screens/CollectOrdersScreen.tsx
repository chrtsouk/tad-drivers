import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, Text, XStack, YStack, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCheck, faCircle, faPlay, faXmark, faPlug } from '@fortawesome/free-solid-svg-icons';
import HapticFeedback from 'react-native-haptic-feedback';
import Input from '../components/Input';
import QrCodeScanner from '../components/QrCodeScanner';
import SafeSpinner from '../components/SafeSpinner';
import { SectionHeader } from '../components/Content';
import { usePlatform } from '../platform/PlatformContext';
import { ScanSession, canStartRun } from '../platform/scanFlow';
import { toast } from '../utils/toast';

/**
 * "Collect orders": scan each bag's QR (payload `TAD|<order number>`) at pickup. The platform checks that every bag is
 * on this driver's run. Only when all bags are scanned can the run start; after that the upstream Orders tab takes over.
 */
const CollectOrdersScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { client, configured, tokenRefused, refreshRun } = usePlatform();
    const session = useMemo(() => new ScanSession(client), [client]);
    const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
    const [manual, setManual] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const lastTick = useRef<string | null>(null);

    useFocusEffect(
        useCallback(() => {
            if (configured) void session.load();
        }, [configured, session])
    );

    // Haptics + auto-dismiss for the non-blocking problems; the red "Wrong bag" screen stays until the driver taps OK.
    useEffect(() => {
        if (!state.alert) return;
        HapticFeedback.trigger('notificationError', { enableVibrateFallback: true, ignoreAndroidSystemSettings: true });
        if (state.alert.kind !== 'wrong_bag') {
            toast.error(state.alert.message);
            const id = setTimeout(() => session.dismissAlert(), 1500);
            return () => clearTimeout(id);
        }
    }, [state.alert, session]);

    useEffect(() => {
        if (state.lastScanned && state.lastScanned !== lastTick.current) {
            lastTick.current = state.lastScanned;
            HapticFeedback.trigger('notificationSuccess', { enableVibrateFallback: true });
        }
    }, [state.lastScanned]);

    const onScan = useCallback((data: any) => void session.scan(data?.value), [session]);

    const submitManual = useCallback(async () => {
        const ok = await session.scan(manual);
        if (ok) setManual('');
    }, [session, manual]);

    const start = useCallback(async () => {
        const ok = await session.start();
        if (ok) {
            toast.success('Run started. Drive safe!');
            void refreshRun();
        }
    }, [session, refreshRun]);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        await session.load();
        setRefreshing(false);
    }, [session]);

    if (!configured || tokenRefused) {
        return (
            <YStack flex={1} bg='$background' p='$4' gap='$3' justifyContent='center'>
                <Text color='$textPrimary' fontSize={20} fontWeight='bold'>
                    {tokenRefused ? 'The shop refused your driver token' : 'Link the TAD platform first'}
                </Text>
                <Button onPress={() => navigation.navigate('DriverAccountTab', { screen: 'PlatformSettings' })} bg='$info' borderWidth={1} borderColor='$infoBorder'>
                    <Button.Icon>
                        <FontAwesomeIcon icon={faPlug} color={theme.infoText.val} />
                    </Button.Icon>
                    <Button.Text color='$infoText'>Open TAD platform settings</Button.Text>
                </Button>
            </YStack>
        );
    }

    const run = state.run;
    const orders = run?.orders ?? [];
    const hasRun = Boolean(run?.batch);
    const started = state.phase === 'started';
    const showScanner = hasRun && !started && state.phase !== 'loading' && state.phase !== 'error';
    const scannedCount = state.scanned.length;

    return (
        <YStack flex={1} bg='$background'>
            <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary.val} />} keyboardShouldPersistTaps='handled' showsVerticalScrollIndicator={false}>
                <SectionHeader title='Collect orders' />
                <YStack p='$4' gap='$3'>
                    {state.phase === 'loading' && !run ? (
                        <XStack gap='$2' alignItems='center'>
                            <SafeSpinner color={theme.textSecondary.val} />
                            <Text color='$textSecondary'>Loading your run...</Text>
                        </XStack>
                    ) : null}

                    {state.phase === 'error' ? (
                        <YStack gap='$2'>
                            <Text color='$errorText' fontWeight='bold'>
                                {state.error}
                            </Text>
                            <Button onPress={refresh} bg='$surface' borderWidth={1} borderColor='$borderColor'>
                                <Button.Text color='$textPrimary'>Try again</Button.Text>
                            </Button>
                        </YStack>
                    ) : null}

                    {state.phase !== 'loading' && state.phase !== 'error' && !hasRun ? (
                        <YStack bg='$surface' borderWidth={1} borderColor='$borderColorWithShadow' borderRadius='$5' p='$4' gap='$2'>
                            <Text color='$textPrimary' fontSize={18} fontWeight='bold'>
                                No orders waiting for you
                            </Text>
                            <Text color='$textSecondary'>{run?.next_run_waiting ? 'Your next run is being prepared. You will get a notification when it is ready.' : 'Clock in and stay online. You will get a notification when your orders are ready to collect.'}</Text>
                        </YStack>
                    ) : null}

                    {started ? (
                        <YStack bg='$success' borderWidth={1} borderColor='$successBorder' borderRadius='$5' p='$4' gap='$3'>
                            <Text color='$successText' fontSize={20} fontWeight='bold'>
                                Run started
                            </Text>
                            <Text color='$successText'>Open your orders to navigate to each drop.</Text>
                            <Button onPress={() => navigation.navigate('DriverTaskTab', { screen: 'DriverOrderManagement' })} bg='$info' borderWidth={1} borderColor='$infoBorder'>
                                <Button.Text color='$infoText'>Open my orders</Button.Text>
                            </Button>
                        </YStack>
                    ) : null}

                    {showScanner ? (
                        <>
                            <YStack height={260} borderRadius='$5' overflow='hidden' bg='black'>
                                <QrCodeScanner onScan={onScan} />
                                {state.phase === 'checking' ? (
                                    <YStack position='absolute' top={0} left={0} right={0} bottom={0} alignItems='center' justifyContent='center' bg='rgba(0,0,0,0.5)'>
                                        <SafeSpinner color='#fff' size='large' />
                                    </YStack>
                                ) : null}
                                {state.lastScanned && state.phase !== 'checking' ? (
                                    <XStack position='absolute' bottom={8} left={8} right={8} bg='$success' borderRadius='$4' px='$3' py='$2' gap='$2' alignItems='center'>
                                        <FontAwesomeIcon icon={faCheck} color={theme.successText.val} />
                                        <Text color='$successText' fontWeight='bold'>
                                            {state.lastScanned} is the right bag
                                        </Text>
                                    </XStack>
                                ) : null}
                            </YStack>

                            <Text color='$textPrimary' fontSize={18} fontWeight='bold'>
                                {scannedCount} of {orders.length} bags scanned
                            </Text>

                            <YStack bg='$surface' borderWidth={1} borderColor='$borderColorWithShadow' borderRadius='$5' overflow='hidden'>
                                {orders.map((o, index) => {
                                    const done = state.scanned.includes(o.number);
                                    return (
                                        <XStack key={o.number} p='$3' gap='$3' alignItems='center' borderTopWidth={index === 0 ? 0 : 1} borderColor='$borderColorWithShadow'>
                                            <FontAwesomeIcon icon={done ? faCheck : faCircle} size={done ? 20 : 14} color={done ? theme.successBorder.val : theme.textSecondary.val} />
                                            <YStack flex={1}>
                                                <Text color='$textPrimary' fontWeight='bold'>
                                                    {o.number}
                                                    {o.stop_seq ? `  (stop ${o.stop_seq})` : ''}
                                                </Text>
                                                <Text color='$textSecondary' numberOfLines={1}>
                                                    {[o.name, o.postcode].filter(Boolean).join(' - ')}
                                                </Text>
                                            </YStack>
                                        </XStack>
                                    );
                                })}
                            </YStack>

                            <Text color='$textSecondary' fontSize={13}>
                                Cannot scan? Type the order number from the bag label.
                            </Text>
                            <XStack gap='$2' alignItems='flex-start'>
                                <YStack flex={1}>
                                    <Input value={manual} onChangeText={setManual} placeholder='TAD-20261015-007' autoCapitalize='characters' returnKeyType='done' onSubmitEditing={submitManual} />
                                </YStack>
                                <Button height={50} onPress={submitManual} disabled={!manual.trim() || state.phase === 'checking'} bg='$info' borderWidth={1} borderColor='$infoBorder'>
                                    <Button.Text color='$infoText'>Check</Button.Text>
                                </Button>
                            </XStack>

                            {state.missing.length > 0 ? (
                                <YStack bg='$error' borderWidth={1} borderColor='$errorBorder' borderRadius='$5' p='$3'>
                                    <Text color='$errorText' fontWeight='bold'>
                                        The shop says these bags are not scanned yet:
                                    </Text>
                                    <Text color='$errorText'>{state.missing.join(', ')}</Text>
                                </YStack>
                            ) : state.error ? (
                                <Text color='$errorText' fontWeight='bold'>
                                    {state.error}
                                </Text>
                            ) : null}

                            <Button size='$6' onPress={start} disabled={!canStartRun(state)} opacity={canStartRun(state) ? 1 : 0.45} bg='$success' borderWidth={1} borderColor='$successBorder'>
                                <Button.Icon>{state.phase === 'starting' ? <SafeSpinner color={theme.successText.val} /> : <FontAwesomeIcon icon={faPlay} color={theme.successText.val} />}</Button.Icon>
                                <Button.Text color='$successText' fontWeight='bold' fontSize={18}>
                                    Start run
                                </Button.Text>
                            </Button>
                            {!canStartRun(state) && state.remaining.length > 0 ? (
                                <Text color='$textSecondary' fontSize={13} textAlign='center'>
                                    Scan every bag to start: {state.remaining.length} left.
                                </Text>
                            ) : null}
                        </>
                    ) : null}
                </YStack>
            </ScrollView>

            <Modal visible={state.alert?.kind === 'wrong_bag'} animationType='fade' statusBarTranslucent onRequestClose={() => session.dismissAlert()}>
                <YStack flex={1} bg='#B91C1C' alignItems='center' justifyContent='center' p='$6' gap='$5'>
                    <FontAwesomeIcon icon={faXmark} size={96} color='#FFFFFF' />
                    <Text color='#FFFFFF' fontSize={44} fontWeight='bold' textAlign='center'>
                        Wrong bag
                    </Text>
                    <Text color='#FFFFFF' fontSize={20} textAlign='center'>
                        {state.alert?.message}
                    </Text>
                    <Pressable onPress={() => session.dismissAlert()} accessibilityRole='button' accessibilityLabel='Dismiss wrong bag warning'>
                        <YStack bg='#FFFFFF' borderRadius='$6' px='$7' py='$4'>
                            <Text color='#B91C1C' fontSize={22} fontWeight='bold'>
                                OK, put it back
                            </Text>
                        </YStack>
                    </Pressable>
                </YStack>
            </Modal>
        </YStack>
    );
};

export default CollectOrdersScreen;
