import { apiClient } from './api.client';
import type { ApiResponse, LoginResponse, User } from '../types';

export async function loginRequest(identifier: string, password: string): Promise<LoginResponse> {
  const trimmed = identifier.trim();
  const { data } = await apiClient.post<ApiResponse<LoginResponse>>('/auth/login', {
    identifier: trimmed,
    email: trimmed.includes('@') ? trimmed.toLowerCase() : undefined,
    phone: trimmed.includes('@') ? undefined : trimmed,
    password,
  });

  if (!data.success || !data.data) {
    throw new Error(data.message ?? 'Login failed');
  }

  return data.data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await apiClient.get<ApiResponse<{ user: User }>>('/auth/me');
  if (!data.success || !data.data?.user) {
    throw new Error(data.message ?? 'Failed to load profile');
  }
  return data.data.user;
}
