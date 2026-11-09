import { useAuthStore } from '../stores/auth.store';
import { isAppAdmin, isBuildingAdmin } from '../types';

/** Height of the compact lock / trial chip, including gap below it. */
export const ACCESS_CHROME_OFFSET = 36;

/**
 * Extra top padding so page titles sit below the building-admin trial/lock chip.
 * Residents never see that chip, so they get 0.
 */
export function useAccessChromeInset() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isBuildingAdmin(user?.role) || isAppAdmin(user?.role);
  if (!isAdmin) return 0;

  const access = user?.buildingAccess;
  if (!access) return 0;

  const canWrite = access.canWrite ?? true;
  const locked = !canWrite;
  const onTrial = access.status === 'trial' && canWrite;
  return locked || onTrial ? ACCESS_CHROME_OFFSET : 0;
}
