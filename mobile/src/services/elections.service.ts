import { apiClient, getAuthToken } from './api.client';
import type {
  ApiResponse,
  ElectionDetailResponse,
  ElectionSummary,
  ElectionsListResponse,
} from '../types';

export async function fetchElections(buildingId?: string): Promise<ElectionsListResponse> {
  const { data } = await apiClient.get<ApiResponse<ElectionsListResponse>>('/elections', {
    params: buildingId ? { buildingId } : undefined,
  });
  if (!data.success || !data.data) {
    throw new Error(data.message ?? 'Failed to load elections');
  }
  return data.data;
}

export async function fetchElection(id: string): Promise<ElectionDetailResponse> {
  const { data } = await apiClient.get<ApiResponse<ElectionDetailResponse>>(`/elections/${id}`);
  if (!data.success || !data.data?.election) {
    throw new Error(data.message ?? 'Failed to load election');
  }
  return data.data;
}

export async function createElection(payload: {
  title: string;
  position: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  showResults: boolean;
  buildingId?: string;
}): Promise<ElectionDetailResponse> {
  const { data } = await apiClient.post<ApiResponse<ElectionDetailResponse>>('/elections', payload);
  if (!data.success || !data.data?.election) {
    throw new Error(data.message ?? 'Failed to create election');
  }
  return data.data;
}

export async function updateElection(
  id: string,
  payload: {
    title?: string;
    position?: string;
    description?: string;
    startsAt?: string;
    endsAt?: string;
    showResults?: boolean;
  },
): Promise<ElectionDetailResponse> {
  const { data } = await apiClient.patch<ApiResponse<ElectionDetailResponse>>(`/elections/${id}`, payload);
  if (!data.success || !data.data?.election) {
    throw new Error(data.message ?? 'Failed to update election');
  }
  return data.data;
}

export async function deleteElection(id: string): Promise<void> {
  const { data } = await apiClient.delete<ApiResponse>(`/elections/${id}`);
  if (!data.success) {
    throw new Error(data.message ?? 'Failed to delete election');
  }
}

export async function addCandidate(payload: {
  electionId: string;
  name: string;
  unitNumber?: string;
  image?: { uri: string; name?: string; type?: string };
}): Promise<ElectionDetailResponse> {
  const form = new FormData();
  form.append('name', payload.name);
  if (payload.unitNumber) form.append('unitNumber', payload.unitNumber);
  if (payload.image) {
    form.append('image', {
      uri: payload.image.uri,
      name: payload.image.name || 'candidate.jpg',
      type: payload.image.type || 'image/jpeg',
    } as unknown as Blob);
  }

  const { data } = await apiClient.post<ApiResponse<ElectionDetailResponse>>(
    `/elections/${payload.electionId}/candidates`,
    form,
    {
      headers: {
        Authorization: getAuthToken() ? `Bearer ${getAuthToken()}` : undefined,
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    },
  );
  if (!data.success || !data.data?.election) {
    throw new Error(data.message ?? 'Failed to add candidate');
  }
  return data.data;
}

export async function deleteCandidate(electionId: string, candidateId: string): Promise<ElectionDetailResponse> {
  const { data } = await apiClient.delete<ApiResponse<ElectionDetailResponse>>(
    `/elections/${electionId}/candidates/${candidateId}`,
  );
  if (!data.success || !data.data?.election) {
    throw new Error(data.message ?? 'Failed to remove candidate');
  }
  return data.data;
}

export async function cancelVote(electionId: string): Promise<ElectionDetailResponse> {
  const { data } = await apiClient.delete<ApiResponse<ElectionDetailResponse>>(`/elections/${electionId}/vote`);
  if (!data.success || !data.data?.election) {
    throw new Error(data.message ?? 'Failed to cancel vote');
  }
  return data.data;
}

export async function castVote(electionId: string, candidateId: string): Promise<ElectionDetailResponse> {
  const { data } = await apiClient.post<ApiResponse<ElectionDetailResponse>>(`/elections/${electionId}/vote`, {
    candidateId,
  });
  if (!data.success || !data.data?.election) {
    throw new Error(data.message ?? 'Failed to record vote');
  }
  return data.data;
}

export function openElectionCount(elections: ElectionSummary[]): number {
  return elections.filter((item) => item.status === 'open').length;
}
