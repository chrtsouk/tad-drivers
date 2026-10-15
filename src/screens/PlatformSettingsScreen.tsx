import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';
import Input from '../components/Input';
import SafeSpinner from '../components/SafeSpinner';
import { usePlatform } from '../platform/PlatformContext';
import { maskToken } from '../platform/settings';
import { errorMessage } from '../platform/errors';
import { toast } from '../utils/toast';

/** Account > TAD platform: the shop address and the driver token the shop admin issued. */
const PlatformSettingsScreen = () => {
    const { settings, configured, tokenRefused, save, disconnect, client } = usePlatform();
    const [baseUrl, setBaseUrl] = useState(settings.baseUrl ?? '');
    const [token, setToken] = useState('');
    const [errors, setErrors] = useState<{ baseUrl?: string; token?: string }>({});
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        if (settings.baseUrl && !baseUrl) setBaseUrl(settings.baseUrl);
    }, [settings.baseUrl]);

    const handleSave = useCallback(async () => {
        setBusy(true);
        setStatus(null);
        const result = await save({ baseUrl, token: token || settings.token || '' });
        if (!result.ok) {
            setErrors(result.errors);
            setBusy(false);
            return;
        }
        setErrors({});
        setToken('');
        try {
            const me = await client.me();
            setStatus({ ok: true, text: me.clocked_in ? 'Connected. You are clocked in.' : 'Connected. You are clocked out.' });
            toast.success('TAD platform linked');
        } catch (err) {
            setStatus({ ok: false, text: `Saved, but the shop could not be reached: ${errorMessage(err)}` });
        }
        setBusy(false);
    }, [save, baseUrl, token, settings.token, client]);

    const handleDisconnect = useCallback(() => {
        Alert.alert('Disconnect from the shop?', 'The driver token is removed from this phone. You can enter it again later.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Disconnect',
                style: 'destructive',
                onPress: async () => {
                    await disconnect();
                    setStatus(null);
                },
            },
        ]);
    }, [disconnect]);

    return (
        <YStack flex={1} bg='$background'>
            <ScrollView keyboardShouldPersistTaps='handled' showsVerticalScrollIndicator={false}>
                <YStack space='$5' px='$4' pt={72} pb='$6'>
                    <YStack space='$2'>
                        <Text color='$textPrimary' fontSize={22} fontWeight='bold'>
                            TAD platform
                        </Text>
                        <Text color='$textSecondary'>The shop gives you a driver token (shown once). Paste it here together with the shop address.</Text>
                    </YStack>

                    {tokenRefused ? (
                        <YStack bg='$warning' borderWidth={1} borderColor='$warningBorder' borderRadius='$5' p='$3'>
                            <Text color='$warningText' fontWeight='bold'>
                                The shop refused your current token. Enter a new one.
                            </Text>
                        </YStack>
                    ) : null}

                    <YStack space='$2'>
                        <Text color='$textPrimary' fontWeight='bold'>
                            PLATFORM ADDRESS
                        </Text>
                        <Input value={baseUrl} onChangeText={setBaseUrl} placeholder='https://drivers.example.com' keyboardType='url' />
                        {errors.baseUrl ? <Text color='$errorText'>{errors.baseUrl}</Text> : null}
                    </YStack>

                    <YStack space='$2'>
                        <Text color='$textPrimary' fontWeight='bold'>
                            DRIVER TOKEN
                        </Text>
                        <Input value={token} onChangeText={setToken} placeholder={configured ? `Saved (${maskToken(settings.token)}). Paste to replace` : 'Paste your driver token'} secureTextEntry />
                        {errors.token ? <Text color='$errorText'>{errors.token}</Text> : null}
                    </YStack>

                    {status ? (
                        <Text color={status.ok ? '$successText' : '$errorText'} fontWeight='bold'>
                            {status.text}
                        </Text>
                    ) : null}

                    <XStack gap='$3'>
                        <Button flex={1} onPress={handleSave} disabled={busy} bg='$success' borderWidth={1} borderColor='$successBorder'>
                            <Button.Icon>{busy ? <SafeSpinner color='#fff' /> : null}</Button.Icon>
                            <Button.Text color='$successText'>Save and test</Button.Text>
                        </Button>
                        {configured ? (
                            <Button flex={1} onPress={handleDisconnect} disabled={busy} bg='$error' borderWidth={1} borderColor='$errorBorder'>
                                <Button.Text color='$errorText'>Disconnect</Button.Text>
                            </Button>
                        ) : null}
                    </XStack>
                </YStack>
            </ScrollView>
        </YStack>
    );
};

export default PlatformSettingsScreen;
