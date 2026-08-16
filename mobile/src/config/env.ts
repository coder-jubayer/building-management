import { Platform } from 'react-native';
import Constants from 'expo-constants';

const API_PORT = 3001;

function lanHostFromUri(value?: string): string | null {
  if (!value) return null;
  const host = value.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

/**
 * On a physical phone, "localhost" is the phone itself.
 * Prefer Expo's Metro host so login keeps working when the PC's LAN IP changes.
 */
function resolveDevApiUrl(): string {
  const expoAny = Constants as {
    expoConfig?: { hostUri?: string; extra?: { apiUrl?: string } };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
    manifest?: { debuggerHost?: string };
  };

  const metroHost = lanHostFromUri(
    expoAny.expoConfig?.hostUri ??
      expoAny.manifest2?.extra?.expoGo?.debuggerHost ??
      expoAny.manifest?.debuggerHost,
  );
  if (metroHost) {
    return `http://${metroHost}:${API_PORT}/api/v1`;
  }

  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && !fromEnv.includes('localhost') && !fromEnv.includes('127.0.0.1')) {
    return fromEnv;
  }

  const extraUrl = expoAny.expoConfig?.extra?.apiUrl;
  if (extraUrl && !extraUrl.includes('localhost') && !extraUrl.includes('127.0.0.1')) {
    return extraUrl;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${API_PORT}/api/v1`;
  }

  return `http://localhost:${API_PORT}/api/v1`;
}

export const config = {
  apiUrl: resolveDevApiUrl(),
  appName: 'Building Management',
  appVersion: Constants.expoConfig?.version ?? '1.0.0',
} as const;
