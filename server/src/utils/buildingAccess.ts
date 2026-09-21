import { Building, IBuildingDocument, BuildingAccessStatus } from '../models/Building';

export interface BuildingAccessInfo {
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

function daysRemaining(endsAt?: Date | null): number | undefined {
  if (!endsAt) return undefined;
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Sync expired trials/activations onto the document (saved by caller if dirty). */
export function refreshBuildingAccess(building: IBuildingDocument): boolean {
  let changed = false;
  const now = new Date();

  if (building.accessStatus === 'trial' && building.trialEndsAt && building.trialEndsAt <= now) {
    building.accessStatus = 'expired';
    if (!building.deactivatedAt) building.deactivatedAt = now;
    changed = true;
  }

  if (building.accessStatus === 'active' && building.expiresAt && building.expiresAt <= now) {
    building.accessStatus = 'expired';
    if (!building.deactivatedAt) building.deactivatedAt = now;
    changed = true;
  }

  return changed;
}

export function buildingCanWrite(building: IBuildingDocument): boolean {
  refreshBuildingAccess(building);
  return building.accessStatus === 'trial' || building.accessStatus === 'active';
}

export function toBuildingAccessInfo(building: IBuildingDocument): BuildingAccessInfo {
  refreshBuildingAccess(building);
  const status = building.accessStatus || 'active';
  const canWrite = status === 'trial' || status === 'active';

  return {
    status,
    canWrite,
    trialClaimed: Boolean(building.trialClaimed),
    trialStartedAt: building.trialStartedAt?.toISOString(),
    trialEndsAt: building.trialEndsAt?.toISOString(),
    trialDaysGranted: building.trialDaysGranted,
    trialDaysRemaining:
      status === 'trial' ? daysRemaining(building.trialEndsAt) : undefined,
    activatedAt: building.activatedAt?.toISOString(),
    expiresAt: building.expiresAt?.toISOString(),
  };
}

export async function loadBuildingAccess(buildingId?: string | null) {
  if (!buildingId) return null;
  const building = await Building.findById(buildingId);
  if (!building) return null;
  if (refreshBuildingAccess(building)) {
    await building.save();
  }
  return { building, access: toBuildingAccessInfo(building) };
}
