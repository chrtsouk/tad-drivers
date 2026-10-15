import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { Button, Text, TextArea, XStack, YStack, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { Order } from '@fleetbase/sdk';
import { usePlatform } from '../platform/PlatformContext';
import { canReportDrop, findPlatformOrder } from '../platform/deliveries';
import { FAIL_REASONS, FailReasonKey, buildFailedPayload } from '../platform/failure';
import { toast } from '../utils/toast';
import SafeSpinner from './SafeSpinner';

/**
 * "Delivered" and "Delivery failed" for orders that came from the TAD platform.
 * They go to the platform (state machine, customer message and batching stay correct), not straight to Fleetbase.
 * Renders nothing for orders that are not on the driver's current platform run.
 */
const PlatformDeliveryActions = ({ order }: { order: Order }) => {
    const theme = useTheme();
    const { configured, run, markDelivered, markFailed } = usePlatform();
    const [busy, setBusy] = useState<'delivered' | 'failed' | null>(null);
    const [failOpen, setFailOpen] = useState(false);
    const [reason, setReason] = useState<FailReasonKey | null>(null);
    const [text, setText] = useState('');
    const [photo, setPhoto] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const platformOrder = findPlatformOrder(run, order?.id);

    const confirmDelivered = useCallback(() => {
        if (!platformOrder) return;
        Alert.alert('Mark as delivered?', `Order ${platformOrder.number} was handed to the customer.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delivered',
                onPress: async () => {
                    setBusy('delivered');
                    const result = await markDelivered(platformOrder.id);
                    setBusy(null);
                    if (result.ok) toast.success(`Order ${platformOrder.number} delivered`);
                    else toast.error(result.message);
                },
            },
        ]);
    }, [platformOrder, markDelivered]);

    const takePhoto = useCallback(async () => {
        try {
            const response = await launchCamera({ mediaType: 'photo', includeBase64: true, maxWidth: 1280, maxHeight: 1280, quality: 0.7, saveToPhotos: false });
            const base64 = response.assets?.[0]?.base64;
            if (base64) setPhoto(base64);
            else if (response.errorMessage) setError(response.errorMessage);
        } catch (err) {
            setError('Could not open the camera');
        }
    }, []);

    const closeFail = useCallback(() => {
        setFailOpen(false);
        setReason(null);
        setText('');
        setPhoto(null);
        setError(null);
    }, []);

    const submitFailed = useCallback(async () => {
        if (!platformOrder) return;
        const built = buildFailedPayload({ reason, text, photo });
        if (!built.ok) {
            setError(built.error);
            return;
        }
        setError(null);
        setBusy('failed');
        const result = await markFailed(platformOrder.id, built.payload);
        setBusy(null);
        if (result.ok) {
            toast.info(`Order ${platformOrder.number} marked as failed`);
            closeFail();
        } else {
            setError(result.message);
        }
    }, [platformOrder, reason, text, photo, markFailed, closeFail]);

    if (!configured || !canReportDrop(platformOrder)) return null;

    return (
        <YStack gap='$2'>
            <Text color='$textSecondary' fontSize={13}>
                Shop order {platformOrder.number}
            </Text>
            <XStack gap='$2'>
                <Button flex={1} onPress={confirmDelivered} disabled={busy !== null} bg='$success' borderWidth={1} borderColor='$successBorder'>
                    <Button.Icon>{busy === 'delivered' ? <SafeSpinner color={theme.successText.val} /> : <FontAwesomeIcon icon={faCheck} color={theme.successText.val} />}</Button.Icon>
                    <Button.Text color='$successText'>Delivered</Button.Text>
                </Button>
                <Button flex={1} onPress={() => setFailOpen(true)} disabled={busy !== null} bg='$error' borderWidth={1} borderColor='$errorBorder'>
                    <Button.Icon>
                        <FontAwesomeIcon icon={faTriangleExclamation} color={theme.errorText.val} />
                    </Button.Icon>
                    <Button.Text color='$errorText'>Failed</Button.Text>
                </Button>
            </XStack>
            <Modal visible={failOpen} animationType='slide' transparent onRequestClose={closeFail}>
                <YStack flex={1} justifyContent='flex-end' bg='rgba(0,0,0,0.6)'>
                    <YStack bg='$background' borderTopLeftRadius='$6' borderTopRightRadius='$6' p='$4' gap='$3' maxHeight='90%'>
                        <ScrollView keyboardShouldPersistTaps='handled'>
                            <YStack gap='$3'>
                                <Text color='$textPrimary' fontSize={20} fontWeight='bold'>
                                    Why could it not be delivered?
                                </Text>
                                {FAIL_REASONS.map((r) => (
                                    <Pressable key={r.key} onPress={() => setReason(r.key)} accessibilityRole='radio' accessibilityState={{ selected: reason === r.key }}>
                                        <XStack bg={reason === r.key ? '$info' : '$surface'} borderWidth={1} borderColor={reason === r.key ? '$infoBorder' : '$borderColorWithShadow'} borderRadius='$5' p='$3'>
                                            <Text color={reason === r.key ? '$infoText' : '$textPrimary'} fontSize={16}>
                                                {r.label}
                                            </Text>
                                        </XStack>
                                    </Pressable>
                                ))}
                                <TextArea value={text} onChangeText={setText} placeholder={reason === 'other' ? 'Tell the shop what happened' : 'Add a note (optional)'} color='$textPrimary' bg='$surface' borderColor='$borderColor' />
                                <Button onPress={takePhoto} bg='$surface' borderWidth={1} borderColor='$borderColor'>
                                    <Button.Icon>
                                        <FontAwesomeIcon icon={faCamera} color={theme.textPrimary.val} />
                                    </Button.Icon>
                                    <Button.Text color='$textPrimary'>{photo ? 'Photo added. Tap to retake' : 'Add a photo (optional)'}</Button.Text>
                                </Button>
                                {error ? (
                                    <Text color='$errorText' fontWeight='bold'>
                                        {error}
                                    </Text>
                                ) : null}
                                <XStack gap='$2'>
                                    <Button flex={1} onPress={closeFail} disabled={busy !== null} bg='$surface' borderWidth={1} borderColor='$borderColor'>
                                        <Button.Text color='$textPrimary'>Cancel</Button.Text>
                                    </Button>
                                    <Button flex={1} onPress={submitFailed} disabled={busy !== null} bg='$error' borderWidth={1} borderColor='$errorBorder'>
                                        <Button.Icon>{busy === 'failed' ? <SafeSpinner color={theme.errorText.val} /> : null}</Button.Icon>
                                        <Button.Text color='$errorText'>Mark as failed</Button.Text>
                                    </Button>
                                </XStack>
                            </YStack>
                        </ScrollView>
                    </YStack>
                </YStack>
            </Modal>
        </YStack>
    );
};

export default PlatformDeliveryActions;
