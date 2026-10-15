import React, { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Button, Text, XStack, YStack, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPowerOff, faPlug } from '@fortawesome/free-solid-svg-icons';
import HapticFeedback from 'react-native-haptic-feedback';
import { usePlatform } from '../platform/PlatformContext';
import { formatShiftTimer } from '../platform/shift';
import { toast } from '../utils/toast';
import SafeSpinner from './SafeSpinner';

/**
 * The clock in / out control. Very visible on the home screen and reused on the dedicated Shift screen.
 * Clocking in also puts the driver online in Fleetbase (the platform does that server side).
 */
const ClockInCard = ({ zone = null, showDetails = false }: { zone?: string | null; showDetails?: boolean }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { configured, tokenRefused, me, meError, clockIn, clockOut, refreshMe } = usePlatform();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [now, setNow] = useState(Date.now());
    const clockedIn = Boolean(me?.clocked_in);

    useEffect(() => {
        if (!clockedIn) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [clockedIn]);

    const openSettings = useCallback(() => {
        navigation.navigate('DriverAccountTab', { screen: 'PlatformSettings' });
    }, [navigation]);

    const toggle = useCallback(async () => {
        setBusy(true);
        setMessage(null);
        const result = clockedIn ? await clockOut() : await clockIn(zone);
        setBusy(false);
        if (!result.ok) {
            setMessage(result.message);
            toast.error(result.message);
            HapticFeedback.trigger('notificationWarning', { enableVibrateFallback: true });
        } else {
            toast.success(clockedIn ? 'You are clocked out' : 'You are clocked in');
        }
    }, [clockedIn, clockIn, clockOut, zone]);

    if (!configured || tokenRefused) {
        return (
            <YStack borderRadius='$6' bg='$warning' borderWidth={1} borderColor='$warningBorder' p='$4' gap='$3'>
                <Text color='$warningText' fontWeight='bold' fontSize={18}>
                    {tokenRefused ? 'The shop refused your driver token' : 'Link the TAD platform'}
                </Text>
                <Text color='$warningText'>{tokenRefused ? 'Ask the shop for a new token and enter it in Account > TAD platform.' : 'Enter the shop address and your driver token to clock in and collect orders.'}</Text>
                <Button onPress={openSettings} bg='$info' borderWidth={1} borderColor='$infoBorder'>
                    <Button.Icon>
                        <FontAwesomeIcon icon={faPlug} color={theme.infoText.val} />
                    </Button.Icon>
                    <Button.Text color='$infoText'>Open TAD platform settings</Button.Text>
                </Button>
            </YStack>
        );
    }

    return (
        <YStack borderRadius='$6' bg={clockedIn ? '$success' : '$surface'} borderWidth={1} borderColor={clockedIn ? '$successBorder' : '$borderColorWithShadow'} p='$4' gap='$3'>
            <XStack justifyContent='space-between' alignItems='center'>
                <YStack>
                    <Text color={clockedIn ? '$successText' : '$textSecondary'} fontSize={13} fontWeight='bold'>
                        {clockedIn ? 'ON SHIFT' : 'OFF SHIFT'}
                    </Text>
                    <Text color={clockedIn ? '$successText' : '$textPrimary'} fontSize={34} fontWeight='bold'>
                        {clockedIn ? formatShiftTimer(me?.since, now) : 'Clocked out'}
                    </Text>
                </YStack>
                {clockedIn && me?.zone ? (
                    <Text color='$successText' fontSize={14}>
                        Zone: {me.zone}
                    </Text>
                ) : null}
            </XStack>
            <Button
                size='$6'
                onPress={toggle}
                disabled={busy}
                opacity={busy ? 0.7 : 1}
                bg={clockedIn ? '$error' : '$success'}
                borderWidth={1}
                borderColor={clockedIn ? '$errorBorder' : '$successBorder'}
                accessibilityLabel={clockedIn ? 'Clock out' : 'Clock in'}
            >
                <Button.Icon>{busy ? <SafeSpinner color={clockedIn ? theme.errorText.val : theme.successText.val} /> : <FontAwesomeIcon icon={faPowerOff} color={clockedIn ? theme.errorText.val : theme.successText.val} />}</Button.Icon>
                <Button.Text color={clockedIn ? '$errorText' : '$successText'} fontWeight='bold' fontSize={18}>
                    {clockedIn ? 'Clock out' : 'Clock in'}
                </Button.Text>
            </Button>
            {message ? (
                <Text color={clockedIn ? '$successText' : '$errorText'} fontWeight='bold'>
                    {message}
                </Text>
            ) : null}
            {meError && !me ? (
                <Button onPress={refreshMe} bg='$surface' borderWidth={1} borderColor='$borderColor'>
                    <Button.Text color='$textPrimary'>Could not reach the shop. Tap to retry.</Button.Text>
                </Button>
            ) : null}
            {showDetails && me?.since ? (
                <Text color={clockedIn ? '$successText' : '$textSecondary'} fontSize={13}>
                    Clocked in at {new Date(me.since).toLocaleTimeString()}
                </Text>
            ) : null}
        </YStack>
    );
};

export default ClockInCard;
