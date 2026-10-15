import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Notifications } from 'react-native-notifications';
import HapticFeedback from 'react-native-haptic-feedback';
import { config } from '../utils';
import { toast } from '../utils/toast';
import { createPlatformClient, PlatformClient } from './client';
import { errorMessage, isPlatformError } from './errors';
import { NotificationPoller, fallbackTitle } from './notifications';
import { secureSettingsStore } from './secureStorage';
import { PlatformSettings, SettingsInput, clearToken, isConfigured, loadSettings, saveSettings } from './settings';
import { findPlatformOrder } from './deliveries';
import type { DriverMe, DriverRun, PlatformMessage } from './types';

type Result = { ok: true } | { ok: false; message: string };

interface PlatformContextValue {
    ready: boolean;
    settings: PlatformSettings;
    configured: boolean;
    /** The platform refused the saved token (401). The driver must enter a new one. */
    tokenRefused: boolean;
    client: PlatformClient;
    me: DriverMe | null;
    meError: string | null;
    run: DriverRun | null;
    banner: PlatformMessage | null;
    dismissBanner: () => void;
    save: (input: SettingsInput) => Promise<{ ok: true } | { ok: false; errors: { baseUrl?: string; token?: string } }>;
    disconnect: () => Promise<void>;
    refreshMe: () => Promise<void>;
    refreshRun: () => Promise<DriverRun | null>;
    clockIn: (zone?: string | null) => Promise<Result>;
    clockOut: () => Promise<Result>;
    markDelivered: (platformOrderId: number) => Promise<Result>;
    markFailed: (platformOrderId: number, payload: { reason: string; photo?: string }) => Promise<Result>;
    /** After Fleetbase proof of delivery succeeded: tell the platform the drop is done. */
    deliverFleetbaseOrder: (fleetbaseOrderId: string) => Promise<Result>;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

const ME_REFRESH_MS = 60000;

export function PlatformProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<PlatformSettings>({ baseUrl: null, token: null });
    const [ready, setReady] = useState(false);
    const [tokenRefused, setTokenRefused] = useState(false);
    const [me, setMe] = useState<DriverMe | null>(null);
    const [meError, setMeError] = useState<string | null>(null);
    const [run, setRun] = useState<DriverRun | null>(null);
    const [banner, setBanner] = useState<PlatformMessage | null>(null);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    const client = useMemo(
        () =>
            createPlatformClient({
                getBaseUrl: () => settingsRef.current.baseUrl,
                getToken: () => settingsRef.current.token,
            }),
        []
    );

    useEffect(() => {
        let active = true;
        loadSettings(secureSettingsStore, config('TAD_PLATFORM_URL'))
            .then((loaded) => active && setSettings(loaded))
            .catch((err) => console.warn('Could not read TAD platform settings:', err))
            .finally(() => active && setReady(true));
        return () => {
            active = false;
        };
    }, []);

    const configured = isConfigured(settings);

    const handleAuthError = useCallback((err: unknown) => {
        if (isPlatformError(err) && err.isUnauthorised) setTokenRefused(true);
    }, []);

    const refreshMe = useCallback(async () => {
        if (!isConfigured(settingsRef.current)) return;
        try {
            setMe(await client.me());
            setMeError(null);
            setTokenRefused(false);
        } catch (err) {
            handleAuthError(err);
            setMeError(errorMessage(err));
        }
    }, [client, handleAuthError]);

    const refreshRun = useCallback(async () => {
        if (!isConfigured(settingsRef.current)) return null;
        try {
            const next = await client.run();
            setRun(next);
            return next;
        } catch (err) {
            handleAuthError(err);
            return null;
        }
    }, [client, handleAuthError]);

    const showMessages = useCallback((messages: PlatformMessage[]) => {
        const latest = messages[messages.length - 1];
        setBanner({ ...latest, title: latest.title || fallbackTitle(latest.kind) });
        messages.forEach((m) => {
            try {
                Notifications.postLocalNotification({
                    title: m.title || fallbackTitle(m.kind),
                    body: m.body ?? '',
                    category: 'TAD_RUN',
                    sound: 'default',
                    userInfo: { type: 'tad_platform', kind: m.kind, batchId: m.batchId },
                } as any);
            } catch (err) {
                console.warn('Could not post local notification:', err);
            }
        });
        try {
            HapticFeedback.trigger('notificationSuccess', { enableVibrateFallback: true });
        } catch {}
        void refreshRun();
    }, [refreshRun]);

    // Polling: every 20 s while a token is saved, plus whenever the app returns to the foreground.
    useEffect(() => {
        if (!configured) return;
        const poller = new NotificationPoller({ client, onNew: showMessages, onAuthError: () => setTokenRefused(true) });
        poller.start();
        void refreshMe();
        void refreshRun();
        const meTimer = setInterval(() => void refreshMe(), ME_REFRESH_MS);
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void poller.pollNow();
                void refreshMe();
                void refreshRun();
            }
        });
        return () => {
            poller.stop();
            clearInterval(meTimer);
            sub.remove();
        };
    }, [configured, settings.token, settings.baseUrl, client, showMessages, refreshMe, refreshRun]);

    const save = useCallback(async (input: SettingsInput) => {
        const result = await saveSettings(secureSettingsStore, input);
        if (result.ok) {
            setSettings({ baseUrl: result.value.baseUrl, token: result.value.token });
            settingsRef.current = { baseUrl: result.value.baseUrl, token: result.value.token };
            setTokenRefused(false);
            setMe(null);
            setRun(null);
            return { ok: true as const };
        }
        return result;
    }, []);

    const disconnect = useCallback(async () => {
        await clearToken(secureSettingsStore);
        setSettings((s) => ({ ...s, token: null }));
        setMe(null);
        setRun(null);
        setBanner(null);
        setTokenRefused(false);
    }, []);

    const guard = useCallback(
        async (action: () => Promise<unknown>, after?: () => Promise<unknown>): Promise<Result> => {
            try {
                await action();
                if (after) await after();
                return { ok: true };
            } catch (err) {
                handleAuthError(err);
                return { ok: false, message: errorMessage(err) };
            }
        },
        [handleAuthError]
    );

    const clockIn = useCallback((zone?: string | null) => guard(() => client.clockIn(zone), refreshMe), [guard, client, refreshMe]);
    const clockOut = useCallback(() => guard(() => client.clockOut(), refreshMe), [guard, client, refreshMe]);
    const markDelivered = useCallback((id: number) => guard(() => client.delivered(id), refreshRun), [guard, client, refreshRun]);
    const markFailed = useCallback((id: number, payload: { reason: string; photo?: string }) => guard(() => client.failed(id, payload), refreshRun), [guard, client, refreshRun]);

    const deliverFleetbaseOrder = useCallback(
        async (fleetbaseOrderId: string): Promise<Result> => {
            if (!isConfigured(settingsRef.current)) return { ok: true }; // not linked: Fleetbase-only use keeps working
            const current = await refreshRun();
            const platformOrder = findPlatformOrder(current, fleetbaseOrderId);
            if (!platformOrder) return { ok: true }; // not one of the shop's platform orders
            if (platformOrder.state !== 'out') return { ok: true }; // already delivered/failed on the platform
            const result = await markDelivered(platformOrder.id);
            if (!result.ok) toast.error(`Fleetbase is updated, but the shop was not told: ${result.message}`);
            return result;
        },
        [refreshRun, markDelivered]
    );

    const value: PlatformContextValue = {
        ready,
        settings,
        configured,
        tokenRefused,
        client,
        me,
        meError,
        run,
        banner,
        dismissBanner: () => setBanner(null),
        save,
        disconnect,
        refreshMe,
        refreshRun,
        clockIn,
        clockOut,
        markDelivered,
        markFailed,
        deliverFleetbaseOrder,
    };

    return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextValue {
    const ctx = useContext(PlatformContext);
    if (!ctx) throw new Error('usePlatform must be used inside <PlatformProvider>');
    return ctx;
}

export default PlatformContext;
