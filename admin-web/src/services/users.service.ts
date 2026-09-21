import { apiClient } from './api.client';
import type { ApiResponse, Building, User, UserRole } from '../types';

export interface UsersListResponse {
  users: User[];
  roles: Array<{ value: UserRole; label: string }>;
  buildings?: Building[];
}

export async function fetchUsers(): Promise<UsersListResponse> {
  const { data } = await apiClient.get<ApiResponse<UsersListResponse>>('/users');
  if (!data.success || !data.data) {
    throw new Error(data.message ?? 'Failed to load users');
  }
  return data.data;
}

export async function setUserActive(userId: string, isActive: boolean): Promise<User> {
  const { data } = await apiClient.patch<ApiResponse<{ user: User }>>(`/users/${userId}/status`, {
    isActive,
  });
  if (!data.success || !data.data?.user) {
    throw new Error(data.message ?? 'Failed to update user status');
  }
  return data.data.user;
}
