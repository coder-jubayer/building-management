import { Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { AuthRequest } from './auth';
import { isAppAdmin } from '../constants/roles';
import { loadBuildingAccess } from '../utils/buildingAccess';

/** Blocks create/update/delete when the caller's building is locked or expired. */
export async function requireBuildingWrite(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      next(new AppError(401, 'Authentication required'));
      return;
    }

    if (isAppAdmin(req.user.role)) {
      next();
      return;
    }

    const buildingId = req.user.buildingId;
    if (!buildingId) {
      next(new AppError(403, 'No building assigned to this account'));
      return;
    }

    const loaded = await loadBuildingAccess(buildingId);
    if (!loaded) {
      next(new AppError(403, 'Building not found'));
      return;
    }

    if (!loaded.access.canWrite) {
      const status = loaded.access.status;
      const message =
        status === 'expired'
          ? 'Your building trial or subscription has ended. Contact support to reactivate.'
          : 'Your building is locked. Start a free trial or contact support to activate.';
      next(new AppError(403, message));
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/** Apply to feature routers so GET stays open while mutations require an unlocked building. */
export function requireBuildingWriteOnMutations(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  void requireBuildingWrite(req, res, next);
}
