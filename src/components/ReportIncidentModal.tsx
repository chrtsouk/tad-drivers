import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { Button, Text, TextArea, XStack, YStack, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons';
import { usePlatform } from '../platform/PlatformContext';
import { DEFAULT_INCIDENT_TYPES, buildIncidentPayload } from '../platform/incident';
import { errorMessage } from '../platform/errors';
import { toast } from '../utils/toast';
import SafeSpinner from './SafeSpinner';

interface Props {
    visible: boolean;
    onClose: () => void;
    /** The platform order this is about (when opened from an order). Omit to report about yourself, optionally picking one of your run's orders. */
    orderId?: number | null;
    orderNumber?: string | null;
}

/** Driver-side incident report: type, note and an optional photo, sent to the shop (it lands in their Incidents list and audit log). */
const ReportIncidentModal = ({ visible, onClose, orderId = null, orderNumber = null }: Props) => {
    const theme = useTheme();
    const { client, run } = usePlatform();
    const [types, setTypes] = useState<Record<string, string>>(DEFAULT_INCIDENT_TYPES);
    const [type, setType] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [photo, setPhoto] = useState<string | null>(null);
    const [pickedOrder, setPickedOrder] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!visible) return;
        let live = true;
        client
            .incidentTypes()
            .then((t) => live && Object.keys(t).length && setTypes(t))
            .catch(() => {});
        return () => {
            live = false;
        };
    }, [visible, client]);

    const close = useCallback(() => {
        setType(null);
        setNote('');
        setPhoto(null);
        setPickedOrder(null);
        setError(null);
        onClose();
    }, [onClose]);

    const takePhoto = useCallback(async () => {
        try {
            const response = await launchCamera({ mediaType: 'photo', includeBase64: true, maxWidth: 1280, maxHeight: 1280, quality: 0.7, saveToPhotos: false });
            const base64 = response.assets?.[0]?.base64;
            if (base64) setPhoto(base64);
            else if (response.errorMessage) setError(response.errorMessage);
        } catch {
            setError('Could not open the camera');
        }
    }, []);

    const submit = useCallback(async () => {
        const built = buildIncidentPayload({ type, note, orderId: orderId ?? pickedOrder, photo }, types);
        if (!built.ok) {
            setError(built.error);
            return;
        }
        setError(null);
        setBusy(true);
        try {
            await client.reportIncident(built.payload);
            toast.success('Incident sent to the shop');
            close();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }, [type, note, orderId, pickedOrder, photo, types, client, close]);

    const runOrders = orderId == null ? run?.orders ?? [] : [];

    return (
        <Modal visible={visible} animationType='slide' transparent onRequestClose={close}>
            <YStack flex={1} justifyContent='flex-end' bg='rgba(0,0,0,0.6)'>
                <YStack bg='$background' borderTopLeftRadius='$6' borderTopRightRadius='$6' p='$4' gap='$3' maxHeight='92%'>
                    <ScrollView keyboardShouldPersistTaps='handled'>
                        <YStack gap='$3'>
                            <Text color='$textPrimary' fontSize={20} fontWeight='bold'>
                                {orderNumber ? `Report an incident - ${orderNumber}` : 'Report an incident'}
                            </Text>
                            {Object.entries(types).map(([key, label]) => (
                                <Pressable key={key} onPress={() => setType(key)} accessibilityRole='radio' accessibilityState={{ selected: type === key }}>
                                    <XStack bg={type === key ? '$info' : '$surface'} borderWidth={1} borderColor={type === key ? '$infoBorder' : '$borderColorWithShadow'} borderRadius='$5' p='$3'>
                                        <Text color={type === key ? '$infoText' : '$textPrimary'} fontSize={16}>
                                            {label}
                                        </Text>
                                    </XStack>
                                </Pressable>
                            ))}
                            <TextArea value={note} onChangeText={setNote} placeholder='What happened?' color='$textPrimary' bg='$surface' borderColor='$borderColor' maxLength={1000} />
                            {runOrders.length > 0 ? (
                                <YStack gap='$2'>
                                    <Text color='$textSecondary' fontSize={13}>
                                        Is it about one of your orders? (optional)
                                    </Text>
                                    <XStack gap='$2' flexWrap='wrap'>
                                        {runOrders.map((o) => (
                                            <Pressable key={o.id} onPress={() => setPickedOrder(pickedOrder === o.id ? null : o.id)} accessibilityRole='checkbox' accessibilityState={{ checked: pickedOrder === o.id }}>
                                                <YStack bg={pickedOrder === o.id ? '$info' : '$surface'} borderWidth={1} borderColor={pickedOrder === o.id ? '$infoBorder' : '$borderColorWithShadow'} borderRadius='$5' px='$3' py='$2'>
                                                    <Text color={pickedOrder === o.id ? '$infoText' : '$textPrimary'}>{o.number}</Text>
                                                </YStack>
                                            </Pressable>
                                        ))}
                                    </XStack>
                                </YStack>
                            ) : null}
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
                                <Button flex={1} onPress={close} disabled={busy} bg='$surface' borderWidth={1} borderColor='$borderColor'>
                                    <Button.Text color='$textPrimary'>Cancel</Button.Text>
                                </Button>
                                <Button flex={1} onPress={submit} disabled={busy} bg='$info' borderWidth={1} borderColor='$infoBorder'>
                                    <Button.Icon>{busy ? <SafeSpinner color={theme.infoText.val} /> : null}</Button.Icon>
                                    <Button.Text color='$infoText'>Send to the shop</Button.Text>
                                </Button>
                            </XStack>
                        </YStack>
                    </ScrollView>
                </YStack>
            </YStack>
        </Modal>
    );
};

export default ReportIncidentModal;
