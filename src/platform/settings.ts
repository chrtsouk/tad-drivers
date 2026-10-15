import { normalizeBaseUrl } from './client';

/** Where the settings live. The app backs `token` with the OS keystore and `url` with MMKV (see secureStorage.ts). */
export interface SettingsStore {
    getUrl(): Promise<string | null>;
    setUrl(value: string): Promise<void>;
    getToken(): Promise<string | null>;
    setToken(value: string): Promise<void>;
    clearToken(): Promise<void>;
}

export interface PlatformSettings {
    baseUrl: string | null;
    token: string | null;
}

export interface SettingsInput {
    baseUrl: string;
    token: string;
}

export type SettingsValidation = { ok: true; value: { baseUrl: string; token: string } } | { ok: false; errors: { baseUrl?: string; token?: string } };

export function validateSettingsInput(input: SettingsInput): SettingsValidation {
    const errors: { baseUrl?: string; token?: string } = {};
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    if (!baseUrl) errors.baseUrl = 'Enter the platform address, for example https://drivers.example.com';
    const token = String(input.token ?? '').trim();
    if (!token) errors.token = 'Paste the driver token the shop gave you';
    else if (/\s/.test(token)) errors.token = 'The token must not contain spaces';
    if (errors.baseUrl || errors.token || !baseUrl) return { ok: false, errors };
    return { ok: true, value: { baseUrl, token } };
}

/** Show enough of a token to recognise it, never all of it. */
export function maskToken(token: string | null | undefined): string {
    const t = String(token ?? '');
    if (!t) return '';
    if (t.length <= 8) return '••••';
    return `${t.slice(0, 4)}••••${t.slice(-2)}`;
}

export async function loadSettings(store: SettingsStore, defaultUrl?: string | null): Promise<PlatformSettings> {
    const storedUrl = await store.getUrl();
    const token = await store.getToken();
    return { baseUrl: normalizeBaseUrl(storedUrl) ?? normalizeBaseUrl(defaultUrl) ?? null, token: token && token.trim() ? token.trim() : null };
}

export async function saveSettings(store: SettingsStore, input: SettingsInput): Promise<SettingsValidation> {
    const result = validateSettingsInput(input);
    if (!result.ok) return result;
    await store.setUrl(result.value.baseUrl);
    await store.setToken(result.value.token);
    return result;
}

/** Remove the token (on "Disconnect" and when the platform refuses it). The address is kept. */
export async function clearToken(store: SettingsStore): Promise<void> {
    await store.clearToken();
}

export const isConfigured = (s: PlatformSettings): boolean => Boolean(s.baseUrl && s.token);
