import * as Keychain from 'react-native-keychain';
import { getString, setString } from '../utils/storage';
import type { SettingsStore } from './settings';

const URL_KEY = 'TAD_PLATFORM_URL';
const TOKEN_SERVICE = 'tad-platform-driver-token';

/**
 * The platform address is not secret (MMKV, like the app's other settings).
 * The driver token IS a credential, so it goes in the OS keystore (Android Keystore / iOS Keychain) via react-native-keychain.
 */
export const secureSettingsStore: SettingsStore = {
    async getUrl() {
        return getString(URL_KEY) ?? null;
    },
    async setUrl(value) {
        setString(URL_KEY, value);
    },
    async getToken() {
        const credentials = await Keychain.getGenericPassword({ service: TOKEN_SERVICE });
        return credentials ? credentials.password : null;
    },
    async setToken(value) {
        await Keychain.setGenericPassword('tad-driver', value, { service: TOKEN_SERVICE });
    },
    async clearToken() {
        await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
    },
};
