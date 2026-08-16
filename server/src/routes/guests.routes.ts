import { Router, Response, NextFunction } from 'express';
import { GuestVisit } from '../models/GuestVisit';
import { Building } from '../models/Building';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest, requireAuth, requireGuestCreator } from '../middleware/auth';
import {
  canCreateGuestVisits,
  canDecideGuestVisits,
  canViewBuildingGuests,
  isAppAdmin,
} from '../constants/roles';
import { GUEST_PURPOSES, isGuestStatus } from '../constants/guests';
import { sendUserPush } from '../utils/push';

const router = Router();
router.use(requireAuth);

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

async function resolveBuildingId(
  actor: { role: string; buildingId?: string },
  requested?: string,
  allowDefault = false,
): Promise<string> {
  if (isAppAdmin(actor.role)) {
    if (requested) {
      const building = await Building.findById(requested);
      if (!building) throw new AppError(404, 'Building not found');
      return building._id.toString();
    }
    if (!allowDefault) throw new AppError(400, 'Select a building');
    const first = await Building.findOne().sort({ name: 1 });
    if (!first) throw new AppError(400, 'No buildings available');
    return first._id.toString();
  }
  if (!actor.buildingId) {
    throw new AppError(400, 'Your account is not linked to a building');
  }
  return actor.buildingId;
}

async function buildingResidents(buildingId: string) {
  const users = await User.find({
    buildingId,
    role: 'resident',
    isActive: true,
  })
    .select('name unitNumber phone')
    .sort({ unitNumber: 1, name: 1 });

  return users.map((user) => ({
    id: user._id.toString(),
    name: user.name,
    unitNumber: user.unitNumber,
    phone: user.phone,
  }));
}

function visitPayload(visit: InstanceType<typeof GuestVisit>, actorId: string, actorRole: string) {
  const json = visit.toSafeJSON();
  return {
    ...json,
    canDecide: json.status === 'pending' && canDecideGuestVisits(actorRole) && json.residentId === actorId,
  };
}

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const canCreate = canCreateGuestVisits(actor.role);
    const canViewAll = canViewBuildingGuests(actor.role);
    const buildings = isAppAdmin(actor.role)
      ? (await Building.find().sort({ name: 1 })).map((item) => item.toSafeJSON())
      : undefined;
    const buildingId = await resolveBuildingId(
      actor,
      req.query.buildingId ? String(req.query.buildingId) : undefined,
      true,
    );

    const query: Record<string, unknown> = { buildingId };
    if (!canViewAll) {
      query.residentId = actor.userId;
    }

    const visits = await GuestVisit.find(query).sort({ createdAt: -1 }).limit(200);
    const pendingCount = visits.filter((item) => item.status === 'pending').length;
    const residents = canCreate ? await buildingResidents(buildingId) : undefined;

    res.json({
      success: true,
      data: {
        visits: visits.map((item) => visitPayload(item, actor.userId, actor.role)),
        pendingCount,
        canCreate,
        canDecide: canDecideGuestVisits(actor.role),
        purposes: [...GUEST_PURPOSES],
        residents,
        buildings,
        buildingId,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireGuestCreator, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const visitorName = String(req.body.name ?? req.body.visitorName ?? '').trim();
    const visitorPhone = normalizePhone(String(req.body.phone ?? req.body.visitorPhone ?? ''));
    const purpose = String(req.body.purpose ?? '').trim();
    const residentId = String(req.body.residentId ?? '').trim();

    if (visitorName.length < 2) {
      throw new AppError(400, 'Enter the visitor name');
    }
    if (visitorPhone.replace(/\D/g, '').length < 3) {
      throw new AppError(400, 'Enter a valid phone number');
    }
    if (purpose.length < 2) {
      throw new AppError(400, 'Enter the visit purpose');
    }
    if (!residentId) {
      throw new AppError(400, 'Select the resident to notify');
    }

    const buildingId = await resolveBuildingId(
      actor,
      req.body.buildingId ? String(req.body.buildingId) : undefined,
    );
    const resident = await User.findById(residentId);
    if (!resident || !resident.isActive || resident.role !== 'resident') {
      throw new AppError(404, 'Resident not found');
    }
    if (!isAppAdmin(actor.role) && resident.buildingId !== buildingId) {
      throw new AppError(403, 'That resident is not in this building');
    }
    if (isAppAdmin(actor.role) && resident.buildingId !== buildingId) {
      throw new AppError(400, 'Select a resident from this building');
    }

    const creator = await User.findById(actor.userId);
    const visit = await GuestVisit.create({
      buildingId: resident.buildingId || buildingId,
      residentId: resident._id.toString(),
      residentName: resident.name,
      unitNumber: resident.unitNumber,
      visitorName,
      visitorPhone,
      purpose,
      status: 'pending',
      createdBy: actor.userId,
      createdByName: creator?.name?.trim() || 'Security',
    });

    await sendUserPush({
      userId: resident._id.toString(),
      title: 'Guest at the gate',
      body: `${visitorName} is here for ${purpose}${resident.unitNumber ? ` · Apt ${resident.unitNumber}` : ''}`,
      channelId: 'guests',
      data: { type: 'guest', visitId: visit._id.toString() },
    });

    res.status(201).json({
      success: true,
      message: `Request sent to ${resident.name}`,
      data: { visit: visitPayload(visit, actor.userId, actor.role) },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const visit = await GuestVisit.findById(req.params.id);
    if (!visit) {
      throw new AppError(404, 'Visit not found');
    }
    if (!canDecideGuestVisits(actor.role) || visit.residentId !== actor.userId) {
      throw new AppError(403, 'Only the host resident can approve or deny this visitor');
    }
    if (visit.status !== 'pending') {
      throw new AppError(400, 'This visit has already been decided');
    }

    const status = String(req.body.status ?? '');
    if (status !== 'approved' && status !== 'denied') {
      throw new AppError(400, 'Choose approved or denied');
    }
    if (!isGuestStatus(status)) {
      throw new AppError(400, 'Invalid status');
    }

    visit.status = status;
    visit.decidedAt = new Date();
    visit.decidedBy = actor.userId;
    await visit.save();

    const decision = status === 'approved' ? 'approved' : 'denied';
    void sendUserPush({
      userId: visit.createdBy,
      title: decision === 'approved' ? 'Visitor approved' : 'Visitor denied',
      body: `${visit.residentName} ${decision} ${visit.visitorName}`,
      channelId: 'guests',
      data: { type: 'guest', visitId: visit._id.toString() },
    });

    res.json({
      success: true,
      message: decision === 'approved' ? 'Visitor approved' : 'Visitor denied',
      data: { visit: visitPayload(visit, actor.userId, actor.role) },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
