import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiClient } from './api.client';

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

function getProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || projectId.startsWith('00000000')) return null;
  return projectId;
}

export async function initNotifications(): Promise<void> {
  // Expo Go throws if expo-notifications is loaded. A development build can register later.
  if (isExpoGo()) return;
}

export async function showLocalGuestAlert(_title: string, _body: string): Promise<void> {
  if (isExpoGo()) return;
  try {
    const Notifications = await import('expo-notifications');
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: _title,
        body: _body,
        sound: true,
        channelId: 'guests',
        data: { type: 'guest' },
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('Local guest alert skipped:', error);
  }
}

export async function registerPushToken(): Promise<void> {
  if (isExpoGo()) return;

  try {
    const [{ default: Device }, Notifications] = await Promise.all([
      import('expo-device'),
      import('expo-notifications'),
    ]);

    if (!Device.isDevice) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('notices', {
        name: 'Notices',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
      });
      await Notifications.setNotificationChannelAsync('guests', {
        name: 'Guest Approvals',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E11D48',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    const projectId = getProjectId();
    if (!projectId) return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return;

    await apiClient.patch('/auth/push-token', { token });
  } catch (error) {
    console.warn('Push token registration skipped:', error);
  }
}

export async function unregisterPushToken(): Promise<void> {
  if (isExpoGo()) return;
  try {
    await apiClient.delete('/auth/push-token');
  } catch {
    // Ignore logout cleanup failures
  }
}

export async function listenForNoticeTap(
  onTap: (data?: Record<string, string>) => void,
): Promise<() => void> {
  if (isExpoGo()) return () => undefined;

  try {
    const Notifications = await import('expo-notifications');
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      onTap(data);
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}
