import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, YStack } from 'tamagui';
import ClockInCard from '../components/ClockInCard';
import Input from '../components/Input';
import { SectionHeader } from '../components/Content';
import { usePlatform } from '../platform/PlatformContext';

/** Dedicated clock in / out screen: the same control as the home screen, plus the optional delivery zone. */
const ShiftScreen = () => {
    const { me } = usePlatform();
    const [zone, setZone] = useState('');
    const clockedIn = Boolean(me?.clocked_in);

    return (
        <YStack flex={1} bg='$background'>
            <ScrollView keyboardShouldPersistTaps='handled' showsVerticalScrollIndicator={false}>
                <YStack pt={64}>
                    <SectionHeader title='My shift' />
                </YStack>
                <YStack p='$4' gap='$4'>
                    <ClockInCard zone={zone.trim() || null} showDetails />
                    {!clockedIn ? (
                        <YStack gap='$2'>
                            <Text color='$textSecondary' fontSize={13}>
                                Zone (optional). Only fill this in if the shop asked you to cover one area.
                            </Text>
                            <Input value={zone} onChangeText={setZone} placeholder='Zone' />
                        </YStack>
                    ) : null}
                    <Text color='$textSecondary' fontSize={13}>
                        Clocking in also makes you available for orders. You cannot clock out in the middle of a run: finish it first.
                    </Text>
                </YStack>
            </ScrollView>
        </YStack>
    );
};

export default ShiftScreen;
