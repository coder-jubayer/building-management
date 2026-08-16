import { apiClient } from './api.client';
import type { ApiResponse, GuestStatus, GuestsListResponse, GuestVisit } from '../types';

export async function fetchGuests(buildingId?: string): Promise<GuestsListResponse> {
  const { data } = await apiClient.get<ApiResponse<GuestsListResponse>>('/guests', {
    params: buildingId ? { buildingId } : undefined,
  });
  if (!data.success || !data.data) {
    throw new Error(data.message ?? 'Failed to load guests');
  }
  return data.data;
}

export async function createGuestVisit(payload: {
  name: string;
  phone: string;
  purpose: string;
  residentId: string;
  buildingId?: string;
}): Promise<GuestVisit> {
  const { data } = await apiClient.post<ApiResponse<{ visit: GuestVisit }>>('/guests', payload);
  if (!data.success || !data.data?.visit) {
    throw new Error(data.message ?? 'Failed to send approval request');
  }
  return data.data.visit;
}

export async function decideGuestVisit(visitId: string, status: Extract<GuestStatus, 'approved' | 'denied'>): Promise<GuestVisit> {
  const { data } = await apiClient.patch<ApiResponse<{ visit: GuestVisit }>>(`/guests/${visitId}`, { status });
  if (!data.success || !data.data?.visit) {
    throw new Error(data.message ?? 'Failed to update visit');
  }
  return data.data.visit;
}
