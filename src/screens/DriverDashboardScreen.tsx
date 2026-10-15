import { useNavigation } from '@react-navigation/native';
import { ScrollView } from 'react-native';
import { Button, Text, YStack, XStack, useTheme } from 'tamagui';
import { useLocation } from '../contexts/LocationContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import { humanize } from 'inflected';
import { get } from '../utils';
import OdometerNumber from '../components/OdometerNumber';
import ClockInCard from '../components/ClockInCard';
import { usePlatform } from '../platform/PlatformContext';
import useAppTheme from '../hooks/use-app-theme';

const WidgetContainer = ({ px = '$4', py = '$4', children, ...props }) => {
    const { isDarkMode } = useAppTheme();
    return (
        <YStack borderRadius='$6' bg='$surface' px={px} py={py} borderWidth={1} borderColor={isDarkMode ? '$transparent' : '$gray-300'} {...props}>
            {children}
        </YStack>
    );
};

const DriverDashboardScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { isTracking, location } = useLocation();
    const { allActiveOrders } = useOrderManager();
    const { configured, run } = usePlatform();
    const waiting = run?.batch?.status === 'assigned' ? run.orders.filter((o) => !o.picked_at).length : 0;

    return (
        <YStack flex={1} bg='$background'>
            <ScrollView showsVerticalScrollIndicator={false}>
            <YStack flex={1} padding='$4' gap='$4'>
                <ClockInCard />
                {configured ? (
                    <XStack gap='$3'>
                        <Button flex={1} onPress={() => navigation.navigate('DriverCollectTab')} bg={waiting ? '$info' : '$surface'} borderWidth={1} borderColor={waiting ? '$infoBorder' : '$borderColorWithShadow'}>
                            <Button.Text color={waiting ? '$infoText' : '$textPrimary'}>{waiting ? `Collect orders (${waiting})` : 'Collect orders'}</Button.Text>
                        </Button>
                        <Button flex={1} onPress={() => navigation.navigate('Shift')} bg='$surface' borderWidth={1} borderColor='$borderColorWithShadow'>
                            <Button.Text color='$textPrimary'>Shift details</Button.Text>
                        </Button>
                    </XStack>
                ) : null}
                <YStack space='$4'>
                    <WidgetContainer>
                        <XStack>
                            <YStack flex={1}>
                                <Text color='$textPrimary'>Tracking:</Text>
                            </YStack>
                            <YStack flex={1} alignItems='flex-end'>
                                <Text color={isTracking ? '$successBorder' : '$textSecondary'}>{isTracking ? 'Yes' : 'No'}</Text>
                            </YStack>
                        </XStack>
                    </WidgetContainer>
                    <WidgetContainer>
                        <Text color='$textPrimary' fontWeight='bold' mb='$3'>
                            Location:
                        </Text>
                        <XStack flexWrap='wrap' gap='$3'>
                            {['latitude', 'longitude', 'heading', 'altitude'].map((key, index) => {
                                return (
                                    <YStack key={index} width='45%' overflow='hidden'>
                                        <Text color='$textSecondary'>{humanize(key)}:</Text>
                                        <Text color='$textPrimary' numberOfLines={1}>
                                            {get(location, `coords.${key}`)}
                                        </Text>
                                    </YStack>
                                );
                            })}
                        </XStack>
                    </WidgetContainer>
                </YStack>
                <XStack gap='$4'>
                    <WidgetContainer flex={1} alignItems='center' justifyContent='center'>
                        <YStack>
                            <Text color='$textPrimary' fontWeight='bold' mb='$2'>
                                Active Orders
                            </Text>
                        </YStack>
                        <YStack>
                            <OdometerNumber value={allActiveOrders.length} digitStyle={{ color: theme['$textSecondary'].val }} digitHeight={36} />
                        </YStack>
                    </WidgetContainer>
                    <WidgetContainer flex={1} alignItems='center' justifyContent='center'>
                        <YStack>
                            <Text color='$textPrimary' fontWeight='bold' mb='$2'>
                                Speed
                            </Text>
                        </YStack>
                        <YStack>
                            <OdometerNumber value={get(location, 'coords.speed', 0)} digitStyle={{ color: theme['$textSecondary'].val }} digitHeight={36} />
                        </YStack>
                    </WidgetContainer>
                </XStack>
            </YStack>
            </ScrollView>
        </YStack>
    );
};

export default DriverDashboardScreen;
