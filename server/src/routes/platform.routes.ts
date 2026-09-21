import { Router, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest, requireAuth, requireAppAdmin } from '../middleware/auth';
import {
  FREE_TRIAL_DAY_OPTIONS,
  getPlatformSettings,
} from '../models/PlatformSettings';
import { Building } from '../models/Building';
import { isBuildingAdmin, isAppAdmin } from '../constants/roles';
import {
  loadBuildingAccess,
  refreshBuildingAccess,
  toBuildingAccessInfo,
} from '../utils/buildingAccess';

const router = Router();

function normalizeWhatsApp(raw: string): string {
  return String(raw || '').replace(/[^\d+]/g, '').trim();
}

router.get('/settings', requireAuth, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await getPlatformSettings();
    res.json({
      success: true,
      data: {
        settings: settings.toSafeJSON(),
        trialDayOptions: FREE_TRIAL_DAY_OPTIONS.map((days) => ({
          value: days,
          label:
            days === 7
              ? '7 days'
              : days === 14
                ? '14 days'
                : days === 30
                  ? '1 month'
                  : '2 months',
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/settings',
  requireAuth,
  requireAppAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const settings = await getPlatformSettings();

      if (typeof req.body.freeTrialEnabled === 'boolean') {
        settings.freeTrialEnabled = req.body.freeTrialEnabled;
      }

      if (req.body.freeTrialDays !== undefined) {
        const days = Number(req.body.freeTrialDays);
        if (!FREE_TRIAL_DAY_OPTIONS.includes(days as (typeof FREE_TRIAL_DAY_OPTIONS)[number])) {
          throw new AppError(400, 'Choose a valid free trial length');
        }
        settings.freeTrialDays = days;
      }

      if (req.body.supportWhatsApp !== undefined) {
        settings.supportWhatsApp = normalizeWhatsApp(String(req.body.supportWhatsApp));
      }

      if (req.body.chargePerBuildingBdt !== undefined) {
        const amount = Number(req.body.chargePerBuildingBdt);
        if (!Number.isFinite(amount) || amount < 0) {
          throw new AppError(400, 'Enter a valid charge amount in BDT (TK)');
        }
        settings.chargePerBuildingBdt = Math.round(amount);
      }

      await settings.save();

      res.json({
        success: true,
        message: 'Platform settings updated',
        data: { settings: settings.toSafeJSON() },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/buildings/:id/access',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const loaded = await loadBuildingAccess(id);
      if (!loaded) throw new AppError(404, 'Building not found');

      const settings = await getPlatformSettings();
      res.json({
        success: true,
        data: {
          access: loaded.access,
          building: loaded.building.toSafeJSON(),
          platform: settings.toSafeJSON(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/buildings/:id/claim-trial',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      if (!isBuildingAdmin(actor.role) && !isAppAdmin(actor.role)) {
        throw new AppError(403, 'Only building admins can start a free trial');
      }

      const id = String(req.params.id);
      if (!isAppAdmin(actor.role) && actor.buildingId !== id) {
        throw new AppError(403, 'You can only activate a trial for your own building');
      }

      const settings = await getPlatformSettings();
      if (!settings.freeTrialEnabled) {
        throw new AppError(400, 'Free trial is not available right now');
      }

      const building = await Building.findById(id);
      if (!building) throw new AppError(404, 'Building not found');
      refreshBuildingAccess(building);

      if (building.trialClaimed) {
        throw new AppError(400, 'This building has already used its free trial');
      }

      if (building.accessStatus === 'active' || building.accessStatus === 'trial') {
        throw new AppError(400, 'This building is already unlocked');
      }

      const days = Number(settings.freeTrialDays) || 14;
      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + days * 24 * 60 * 60 * 1000);

      building.accessStatus = 'trial';
      building.trialClaimed = true;
      building.trialStartedAt = startedAt;
      building.trialEndsAt = endsAt;
      building.trialDaysGranted = days;
      await building.save();

      res.json({
        success: true,
        message: `Free trial started for ${days} days`,
        data: {
          access: toBuildingAccessInfo(building),
          building: building.toSafeJSON(),
          platform: settings.toSafeJSON(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/buildings/:id/access',
  requireAuth,
  requireAppAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const building = await Building.findById(id);
      if (!building) throw new AppError(404, 'Building not found');

      const status = String(req.body.accessStatus || '').trim();
      if (!['locked', 'active', 'expired'].includes(status)) {
        throw new AppError(400, 'accessStatus must be locked, active, or expired');
      }

      // Paid/manual activation — does not rewrite an already-running trial's granted days.
      if (status === 'active') {
        building.accessStatus = 'active';
        building.activatedAt = new Date();
        building.deactivatedAt = undefined;
        if (req.body.expiresAt) {
          building.expiresAt = new Date(String(req.body.expiresAt));
        } else if (req.body.days) {
          const days = Number(req.body.days);
          if (!Number.isFinite(days) || days <= 0) {
            throw new AppError(400, 'Enter a valid number of days');
          }
          building.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        } else {
          building.expiresAt = undefined;
        }
      } else if (status === 'locked') {
        building.accessStatus = 'locked';
        if (!building.deactivatedAt) building.deactivatedAt = new Date();
      } else {
        building.accessStatus = 'expired';
        if (!building.deactivatedAt) building.deactivatedAt = new Date();
      }

      await building.save();

      res.json({
        success: true,
        message: 'Building access updated',
        data: {
          access: toBuildingAccessInfo(building),
          building: building.toSafeJSON(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
