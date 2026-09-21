import { apiClient } from './api.client';
import type { ApiResponse, Building, BuildingAccess, PlatformSettings, TrialDayOption } from '../types';

export async function fetchPlatformSettings(): Promise<{
  settings: PlatformSettings;
  trialDayOptions: TrialDayOption[];
}> {
  const { data } = await apiClient.get<
    ApiResponse<{ settings: PlatformSettings; trialDayOptions: TrialDayOption[] }>
  >('/platform/settings');
  if (!data.success || !data.data?.settings) {
    throw new Error(data.message ?? 'Failed to load platform settings');
  }
  return {
    settings: data.data.settings,
    trialDayOptions: data.data.trialDayOptions ?? [],
  };
}

export async function updatePlatformSettings(payload: {
  freeTrialEnabled?: boolean;
  freeTrialDays?: number;
  supportWhatsApp?: string;
  chargePerBuildingBdt?: number;
}): Promise<PlatformSettings> {
  const { data } = await apiClient.patch<ApiResponse<{ settings: PlatformSettings }>>(
    '/platform/settings',
    payload,
  );
  if (!data.success || !data.data?.settings) {
    throw new Error(data.message ?? 'Failed to update settings');
  }
  return data.data.settings;
}

export async function setBuildingAccess(
  buildingId: string,
  payload: { accessStatus: 'locked' | 'active' | 'expired'; days?: number; expiresAt?: string },
): Promise<{ building: Building; access: BuildingAccess }> {
  const { data } = await apiClient.patch<ApiResponse<{ building: Building; access: BuildingAccess }>>(
    `/platform/buildings/${buildingId}/access`,
    payload,
  );
  if (!data.success || !data.data?.building) {
    throw new Error(data.message ?? 'Failed to update building access');
  }
  return data.data;
}
