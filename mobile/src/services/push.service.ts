import { apiClient } from './api.client';

export async function initNotifications(): Promise<void> {
  return;
}

export async function showLocalGuestAlert(_title: string, _body: string): Promise<void> {
  return;
}

export async function registerPushToken(): Promise<void> {
  return;
}

export async function unregisterPushToken(): Promise<void> {
  try {
    await apiClient.delete('/auth/push-token');
  } catch {
    // Ignore logout cleanup failures
  }
}

export async function listenForNoticeTap(
  _onTap: (data?: Record<string, string>) => void,
): Promise<() => void> {
  return () => undefined;
}
