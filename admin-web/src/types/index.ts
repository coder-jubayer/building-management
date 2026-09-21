export const USER_ROLES = [
  'app_admin',
  'building_admin',
  'committee',
  'guard',
  'resident',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  app_admin: 'App Admin',
  building_admin: 'Building Admin',
  committee: 'Committee',
  guard: 'Security Guard',
  resident: 'Resident',
};

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  unitNumber?: string;
  buildingId?: string;
  buildingName?: string;
  buildingCode?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type BuildingAccessStatus = 'locked' | 'trial' | 'active' | 'expired';

export interface Building {
  id: string;
  name: string;
  code: string;
  isActive?: boolean;
  accessStatus?: BuildingAccessStatus;
  trialClaimed?: boolean;
  trialStartedAt?: string;
  trialEndsAt?: string;
  trialDaysGranted?: number;
  activatedAt?: string;
  expiresAt?: string;
  userCount?: number;
  activeUserCount?: number;
  createdAt?: string;
}

export interface BuildingAccess {
  status: BuildingAccessStatus;
  canWrite: boolean;
  trialClaimed: boolean;
  trialStartedAt?: string;
  trialEndsAt?: string;
  trialDaysGranted?: number;
  trialDaysRemaining?: number;
  activatedAt?: string;
  expiresAt?: string;
}

export interface PlatformSettings {
  freeTrialEnabled: boolean;
  freeTrialDays: number;
  supportWhatsApp: string;
  freeTrialLabel: string;
  chargePerBuildingBdt: number;
}

export interface TrialDayOption {
  value: number;
  label: string;
}

export interface OverviewStats {
  buildings: { total: number; active: number; inactive: number };
  users: { total: number; active: number; inactive: number };
  byRole: Array<{ role: UserRole; label: string; count: number }>;
  access?: {
    locked: number;
    trial: number;
    active: number;
    expired: number;
  };
  timeline?: {
    activationPeriods: Array<{ start: string; end: string | null }>;
    runningPeriods: Array<{ start: string; end: string | null }>;
  };
  earnings?: {
    activatedNow: number;
    chargePerBuildingBdt: number;
    estimatedEarningsBdt: number;
    currency: 'BDT';
  };
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export function isAppAdmin(role?: string | null): boolean {
  return role === 'app_admin';
}

export const ACCESS_LABELS: Record<BuildingAccessStatus, string> = {
  locked: 'Locked',
  trial: 'Free trial',
  active: 'Activated',
  expired: 'Expired',
};
