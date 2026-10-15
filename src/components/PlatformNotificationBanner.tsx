import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBagShopping, faXmark } from '@fortawesome/free-solid-svg-icons';
import { usePlatform } from '../platform/PlatformContext';
import { fallbackTitle } from '../platform/notifications';

const AUTO_HIDE_MS = 30000;

/** In-app banner for "Your next orders are ready" / "Pick up your orders". Tapping it opens Collect orders. */
const PlatformNotificationBanner = ({ onOpen }: { onOpen: () => void }) => {
    const { banner, dismissBanner } = usePlatform();
    const theme = useTheme();

    useEffect(() => {
        if (!banner) return;
        const id = setTimeout(dismissBanner, AUTO_HIDE_MS);
        return () => clearTimeout(id);
    }, [banner, dismissBanner]);

    if (!banner) return null;

    return (
        <YStack position='absolute' top={8} left={12} right={12} zIndex={100} elevation={8}>
            <Pressable
                onPress={() => {
                    dismissBanner();
                    onOpen();
                }}
                accessibilityRole='button'
                accessibilityLabel={banner.title}
            >
                <XStack bg='$info' borderWidth={1} borderColor='$infoBorder' borderRadius='$5' p='$3' gap='$3' alignItems='center'>
                    <FontAwesomeIcon icon={faBagShopping} size={22} color={theme.infoText.val} />
                    <YStack flex={1}>
                        <Text color='$infoText' fontWeight='bold' fontSize={16}>
                            {banner.title || fallbackTitle(banner.kind)}
                        </Text>
                        {banner.body ? (
                            <Text color='$infoText' fontSize={13}>
                                {banner.body}
                            </Text>
                        ) : null}
                    </YStack>
                    <Pressable onPress={dismissBanner} hitSlop={12} accessibilityLabel='Dismiss'>
                        <FontAwesomeIcon icon={faXmark} size={18} color={theme.infoText.val} />
                    </Pressable>
                </XStack>
            </Pressable>
        </YStack>
    );
};

export default PlatformNotificationBanner;
