import { apiClient } from './api.client';
import type {
  AmenitiesListResponse,
  AmenityBooking,
  AmenitySlotsResponse,
  ApiResponse,
} from '../types';

export async function fetchAmenities(params?: {
  date?: string;
  buildingId?: string;
}): Promise<AmenitiesListResponse> {
  const { data } = await apiClient.get<ApiResponse<AmenitiesListResponse>>('/amenities', { params });
  if (!data.success || !data.data) {
    throw new Error(data.message ?? 'Failed to load amenities');
  }
  return data.data;
}

export async function fetchAmenitySlots(
  amenityId: string,
  params?: { date?: string; buildingId?: string },
): Promise<AmenitySlotsResponse> {
  const { data } = await apiClient.get<ApiResponse<AmenitySlotsResponse>>(
    `/amenities/${amenityId}/slots`,
    { params },
  );
  if (!data.success || !data.data) {
    throw new Error(data.message ?? 'Failed to load time slots');
  }
  return data.data;
}

export async function bookAmenitySlot(payload: {
  amenityId: string;
  date: string;
  startTime: string;
  buildingId?: string;
}): Promise<AmenityBooking> {
  const { amenityId, ...body } = payload;
  const { data } = await apiClient.post<ApiResponse<{ booking: AmenityBooking }>>(
    `/amenities/${amenityId}/bookings`,
    body,
  );
  if (!data.success || !data.data?.booking) {
    throw new Error(data.message ?? 'Failed to book slot');
  }
  return data.data.booking;
}

export async function cancelAmenityBooking(bookingId: string): Promise<void> {
  const { data } = await apiClient.delete<ApiResponse>(`/amenities/bookings/${bookingId}`);
  if (!data.success) {
    throw new Error(data.message ?? 'Failed to cancel booking');
  }
}

export async function updateAmenitySettings(payload: {
  amenityId: string;
  slotMinutes: number;
  capacity: number;
  buildingId?: string;
}): Promise<{ slotMinutes: number; capacity: number }> {
  const { amenityId, ...body } = payload;
  const { data } = await apiClient.patch<
    ApiResponse<{ amenity: { slotMinutes: number; capacity: number } }>
  >(`/amenities/${amenityId}/settings`, body);
  if (!data.success || !data.data?.amenity) {
    throw new Error(data.message ?? 'Failed to update facility settings');
  }
  return data.data.amenity;
}
