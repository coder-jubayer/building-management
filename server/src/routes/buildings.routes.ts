import { Router, Response, NextFunction } from 'express';
import { Building } from '../models/Building';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest, requireAuth, requireAppAdmin } from '../middleware/auth';
import { ROLE_LABELS, USER_ROLES, UserRole } from '../constants/roles';
import { toUserDTOList } from '../utils/buildings';
import { getPlatformSettings } from '../models/PlatformSettings';
import {
  BuildingReportData,
  BuildingReportRole,
  buildingReportFilename,
  writeBuildingReport,
} from '../utils/buildingReport';
import mongoose from 'mongoose';

const router = Router();

router.use(requireAuth, requireAppAdmin);

const ROLE_ORDER: UserRole[] = ['building_admin', 'committee', 'guard', 'resident', 'app_admin'];
const REPORT_ROLES: BuildingReportRole[] = [
  'building_admin',
  'committee',
  'guard',
  'resident',
];

function roleSortKey(role: string) {
  const index = ROLE_ORDER.indexOf(role as UserRole);
  return index === -1 ? ROLE_ORDER.length : index;
}

function assertBuildingId(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(404, 'Building not found');
  }
}

function parseReportRoles(raw: unknown): BuildingReportRole[] {
  const values = Array.isArray(raw)
    ? raw.map(String)
    : String(raw ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  const selected = REPORT_ROLES.filter((role) => values.includes(role));
  if (!selected.length) {
    throw new AppError(
      400,
      'Select at least one role: building_admin, committee, guard, resident',
    );
  }
  return selected;
}

router.get('/overview', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [
      buildingsTotal,
      buildingsActive,
      usersTotal,
      usersActive,
      roleCounts,
      accessCounts,
      buildingsForTrends,
      platform,
    ] = await Promise.all([
      Building.countDocuments(),
      Building.countDocuments({ isActive: true }),
      User.countDocuments({ role: { $ne: 'app_admin' } }),
      User.countDocuments({ role: { $ne: 'app_admin' }, isActive: true }),
      User.aggregate<{ _id: string; count: number }>([
        { $match: { role: { $ne: 'app_admin' } } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      Building.aggregate<{ _id: string; count: number }>([
        { $group: { _id: { $ifNull: ['$accessStatus', 'active'] }, count: { $sum: 1 } } },
      ]),
      Building.find()
        .select(
          'createdAt updatedAt accessStatus trialStartedAt trialEndsAt activatedAt deactivatedAt expiresAt trialClaimed',
        )
        .lean(),
      getPlatformSettings(),
    ]);

    const byRole = USER_ROLES.filter((role) => role !== 'app_admin').map((role) => ({
      role,
      label: ROLE_LABELS[role],
      count: roleCounts.find((item) => item._id === role)?.count ?? 0,
    }));

    const access = {
      locked: 0,
      trial: 0,
      active: 0,
      expired: 0,
    };
    for (const row of accessCounts) {
      const key = String(row._id || 'locked') as keyof typeof access;
      if (key in access) access[key] = row.count;
    }

    const chargePerBuildingBdt = Math.max(0, Number(platform.chargePerBuildingBdt) || 0);

    type Period = { start: string; end: string | null };

    const toValidDate = (value: unknown): Date | null => {
      if (!value) return null;
      const d = new Date(value as string | Date);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    /** Paid activation periods: start → still active (null) or deactivated. */
    const activationPeriods: Period[] = [];
    /** Running periods including free trial (merged per building). */
    const runningPeriods: Period[] = [];

    for (const b of buildingsForTrends) {
      const activatedAt =
        toValidDate(b.activatedAt) ||
        (b.accessStatus === 'active' ? toValidDate(b.createdAt) : null);

      const trialAt =
        toValidDate(b.trialStartedAt) ||
        (b.accessStatus === 'trial' || b.trialClaimed ? toValidDate(b.createdAt) : null);

      const deactivatedAt =
        toValidDate(b.deactivatedAt) ||
        (b.accessStatus === 'active'
          ? null
          : toValidDate(b.expiresAt) ||
            (activatedAt && b.accessStatus !== 'trial' ? toValidDate(b.updatedAt) : null));

      const trialEnd =
        b.accessStatus === 'trial'
          ? null
          : toValidDate(b.trialEndsAt) ||
            (activatedAt && trialAt && activatedAt > trialAt ? activatedAt : null) ||
            deactivatedAt;

      if (activatedAt) {
        const end =
          b.accessStatus === 'active'
            ? null
            : deactivatedAt && deactivatedAt >= activatedAt
              ? deactivatedAt
              : toValidDate(b.updatedAt);
        activationPeriods.push({
          start: activatedAt.toISOString(),
          end: end ? end.toISOString() : null,
        });
      }

      if (activatedAt || trialAt) {
        const start =
          activatedAt && trialAt
            ? activatedAt.getTime() <= trialAt.getTime()
              ? activatedAt
              : trialAt
            : (activatedAt || trialAt)!;

        let end: Date | null = null;
        if (b.accessStatus === 'active' || b.accessStatus === 'trial') {
          end = null;
        } else if (activatedAt) {
          end =
            deactivatedAt && deactivatedAt >= start
              ? deactivatedAt
              : toValidDate(b.updatedAt);
        } else {
          end = trialEnd && trialEnd >= start ? trialEnd : toValidDate(b.updatedAt);
        }

        runningPeriods.push({
          start: start.toISOString(),
          end: end ? end.toISOString() : null,
        });
      }
    }

    const activatedNow = access.active;
    const estimatedEarningsBdt = activatedNow * chargePerBuildingBdt;

    res.json({
      success: true,
      data: {
        buildings: {
          total: buildingsTotal,
          active: buildingsActive,
          inactive: buildingsTotal - buildingsActive,
        },
        users: {
          total: usersTotal,
          active: usersActive,
          inactive: usersTotal - usersActive,
        },
        byRole,
        access,
        timeline: {
          activationPeriods,
          runningPeriods,
        },
        earnings: {
          activatedNow,
          chargePerBuildingBdt,
          estimatedEarningsBdt,
          currency: 'BDT',
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const buildings = await Building.find().sort({ name: 1 });
    const buildingIds = buildings.map((b) => b._id.toString());

    const userCounts = buildingIds.length
      ? await User.aggregate<{ _id: string; total: number; active: number }>([
          { $match: { buildingId: { $in: buildingIds } } },
          {
            $group: {
              _id: '$buildingId',
              total: { $sum: 1 },
              active: { $sum: { $cond: ['$isActive', 1, 0] } },
            },
          },
        ])
      : [];

    const countMap = new Map(userCounts.map((row) => [row._id, row]));

    res.json({
      success: true,
      data: {
        buildings: buildings.map((building) => {
          const id = building._id.toString();
          const counts = countMap.get(id);
          return {
            ...building.toSafeJSON(),
            userCount: counts?.total ?? 0,
            activeUserCount: counts?.active ?? 0,
            createdAt: building.createdAt,
          };
        }),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/report', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const roles = parseReportRoles(req.query.roles);
    const buildingIdRaw = req.query.buildingId ? String(req.query.buildingId).trim() : '';
    if (buildingIdRaw) assertBuildingId(buildingIdRaw);

    const buildings = buildingIdRaw
      ? await Building.find({ _id: buildingIdRaw }).sort({ name: 1 })
      : await Building.find().sort({ name: 1 });

    if (buildingIdRaw && !buildings.length) {
      throw new AppError(404, 'Building not found');
    }

    const buildingIds = buildings.map((building) => building._id.toString());
    const users = buildingIds.length
      ? await User.find({
          buildingId: { $in: buildingIds },
          role: { $in: roles },
        }).sort({ name: 1 })
      : [];

    // Pull building creators into the building_admin section when that role is selected
    // and the building has no dedicated building_admin user.
    if (roles.includes('building_admin')) {
      for (const building of buildings) {
        const id = building._id.toString();
        const hasAdmin = users.some(
          (user) => user.buildingId === id && user.role === 'building_admin',
        );
        if (hasAdmin || !building.createdBy) continue;
        const creator = await User.findById(building.createdBy);
        if (!creator) continue;
        if (users.some((user) => user._id.toString() === creator._id.toString())) continue;
        users.push(creator);
      }
    }

    const byBuilding = new Map<string, typeof users>();
    for (const user of users) {
      if (!user.buildingId) continue;
      const list = byBuilding.get(user.buildingId) ?? [];
      list.push(user);
      byBuilding.set(user.buildingId, list);
    }

    const reporter = await User.findById(actor.userId);
    const report: BuildingReportData = {
      generatedBy: reporter?.name?.trim() || 'App Admin',
      roles,
      buildings: buildings.map((building) => {
        const id = building._id.toString();
        const people = (byBuilding.get(id) ?? []).map((user) => {
          const role: BuildingReportRole =
            user.role === 'building_admin'
              ? 'building_admin'
              : REPORT_ROLES.includes(user.role as BuildingReportRole)
                ? (user.role as BuildingReportRole)
                : 'building_admin';
          return {
            name: user.name,
            email: user.email,
            phone: user.phone,
            unitNumber: user.unitNumber,
            role,
            isActive: Boolean(user.isActive),
          };
        }).filter((person) => roles.includes(person.role));

        return {
          name: building.name,
          code: building.code,
          isActive: Boolean(building.isActive),
          people,
        };
      }),
    };

    const scope = buildingIdRaw ? report.buildings[0]?.name || 'building' : 'all';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${buildingReportFilename(scope)}"`,
    );
    writeBuildingReport(res, report);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    assertBuildingId(id);
    const building = await Building.findById(id);
    if (!building) {
      throw new AppError(404, 'Building not found');
    }

    const users = await User.find({ buildingId: id });

    // Always surface a building admin when possible:
    // 1) role=building_admin on this building
    // 2) else the building creator (even if role drifted to app_admin)
    const hasBuildingAdmin = users.some((u) => u.role === 'building_admin');
    if (!hasBuildingAdmin && building.createdBy) {
      const creator = await User.findById(building.createdBy);
      if (creator && !users.some((u) => u._id.toString() === creator._id.toString())) {
        users.unshift(creator);
      }
    }

    users.sort((a, b) => {
      const byRole = roleSortKey(a.role) - roleSortKey(b.role);
      if (byRole !== 0) return byRole;
      return a.name.localeCompare(b.name);
    });

    const dtoUsers = await toUserDTOList(users, req);
    const activeUserCount = users.filter((u) => u.isActive).length;
    const admins = dtoUsers.filter(
      (u) => u.role === 'building_admin' || (u.role === 'app_admin' && u.buildingId === id),
    );

    res.json({
      success: true,
      data: {
        building: {
          ...building.toSafeJSON(),
          userCount: users.length,
          activeUserCount,
          createdAt: building.createdAt,
        },
        users: dtoUsers,
        admins,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    assertBuildingId(id);
    const isActive = Boolean(req.body.isActive);

    const building = await Building.findById(id);
    if (!building) {
      throw new AppError(404, 'Building not found');
    }

    building.isActive = isActive;
    await building.save();

    let usersUpdated = 0;
    // Deactivating a building locks out everyone in it.
    // Reactivating does not auto-restore users — activate them individually if needed.
    if (!isActive) {
      const result = await User.updateMany(
        { buildingId: id, role: { $ne: 'app_admin' } },
        { $set: { isActive: false } },
      );
      usersUpdated = result.modifiedCount;
    }

    const counts = await User.aggregate<{ total: number; active: number }>([
      { $match: { buildingId: id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
        },
      },
    ]);

    res.json({
      success: true,
      message: isActive
        ? 'Building activated'
        : `Building deactivated${usersUpdated ? ` (${usersUpdated} users deactivated)` : ''}`,
      data: {
        building: {
          ...building.toSafeJSON(),
          userCount: counts[0]?.total ?? 0,
          activeUserCount: counts[0]?.active ?? 0,
          createdAt: building.createdAt,
        },
        usersUpdated,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
