import React, { useState } from 'react';
import { Button, Text, YStack, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { Order } from '@fleetbase/sdk';
import { usePlatform } from '../platform/PlatformContext';
import { findPlatformOrder } from '../platform/deliveries';
import ReportIncidentModal from './ReportIncidentModal';

/** For an order on the driver's platform run: the shop's custom fields (gate code, spice level...) and a "Report an incident" button. */
const PlatformOrderInfo = ({ order }: { order: Order }) => {
    const theme = useTheme();
    const { configured, run } = usePlatform();
    const [open, setOpen] = useState(false);
    const platformOrder = findPlatformOrder(run, order?.id);
    if (!configured || !platformOrder) return null;
    const custom = platformOrder.custom ?? [];
    return (
        <YStack gap='$2'>
            {custom.length > 0 ? (
                <YStack bg='$surface' borderWidth={1} borderColor='$borderColorWithShadow' borderRadius='$5' p='$3' gap='$1'>
                    {custom.map((c) => (
                        <Text key={c.label} color='$textPrimary'>
                            <Text fontWeight='bold'>{c.label}: </Text>
                            {c.value}
                        </Text>
                    ))}
                </YStack>
            ) : null}
            <Button onPress={() => setOpen(true)} bg='$surface' borderWidth={1} borderColor='$borderColor'>
                <Button.Icon>
                    <FontAwesomeIcon icon={faTriangleExclamation} color={theme.textPrimary.val} />
                </Button.Icon>
                <Button.Text color='$textPrimary'>Report an incident</Button.Text>
            </Button>
            <ReportIncidentModal visible={open} onClose={() => setOpen(false)} orderId={platformOrder.id} orderNumber={platformOrder.number} />
        </YStack>
    );
};

export default PlatformOrderInfo;
