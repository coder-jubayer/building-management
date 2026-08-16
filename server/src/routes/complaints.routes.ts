import fs from 'fs';
import path from 'path';
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { Complaint, IComplaintDocument, ComplaintMediaKind } from '../models/Complaint';
import { ComplaintComment } from '../models/ComplaintComment';
import { Building } from '../models/Building';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest, requireAuth, requireComplaintCreator } from '../middleware/auth';
import { canCreateComplaint, canManageComplaints, isAppAdmin } from '../constants/roles';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_VALUES,
  COMPLAINT_STATUSES,
  ComplaintStatus,
  complaintCategoryLabel,
  complaintStatusLabel,
} from '../constants/complaints';
import {
  complaintsUploadDir,
  ensureUploadDirs,
  publicFileUrl,
  storedComplaintPath,
} from '../utils/uploads';

const router = Router();
router.use(requireAuth);
ensureUploadDirs();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDirs();
    cb(null, complaintsUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.mp4', '.mov', '.webm', '.m4v'].includes(ext)
      ? ext
      : '.bin';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
  },
});

const complaintUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!/^(image|video)\//i.test(file.mimetype || '')) {
      cb(new AppError(400, 'Only images or videos are allowed'));
      return;
    }
    cb(null, true);
  },
});

async function resolveBuildingId(
  actor: { role: string; buildingId?: string },
  requested?: string,
  allowDefault = false,
): Promise<string | undefined> {
  if (isAppAdmin(actor.role)) {
    if (requested) {
      const building = await Building.findById(requested);
      if (!building) throw new AppError(404, 'Building not found');
      return building._id.toString();
    }
    if (!allowDefault) throw new AppError(400, 'Select a building');
    const first = await Building.findOne().sort({ name: 1 });
    return first?._id.toString();
  }
  if (!actor.buildingId) {
    throw new AppError(400, 'Your account is not linked to a building');
  }
  return actor.buildingId;
}

function mediaKind(mimetype?: string): ComplaintMediaKind {
  return /^video\//i.test(mimetype || '') ? 'video' : 'image';
}

function commentDto(req: AuthRequest, comment: InstanceType<typeof ComplaintComment>) {
  const media = (comment.media || [])
    .map((item) => {
      const url = publicFileUrl(req, item.path);
      return url ? { url, kind: item.kind } : null;
    })
    .filter((item): item is { url: string; kind: ComplaintMediaKind } => Boolean(item));
  return comment.toSafeJSON(media);
}

type ReporterInfo = { phone?: string; email?: string; role?: string };

function complaintDto(
  req: AuthRequest,
  complaint: IComplaintDocument,
  actorId: string,
  actorRole: string,
  reporter?: ReporterInfo | null,
) {
  const media = (complaint.media || [])
    .map((item) => {
      const url = publicFileUrl(req, item.path);
      return url ? { url, kind: item.kind } : null;
    })
    .filter((item): item is { url: string; kind: ComplaintMediaKind } => Boolean(item));

  return {
    ...complaint.toSafeJSON(media),
    categoryLabel: complaintCategoryLabel(complaint.category),
    statusLabel: complaintStatusLabel(complaint.status),
    isMine: complaint.createdBy === actorId,
    canManage: canManageComplaints(actorRole),
    canComment: canManageComplaints(actorRole) || complaint.createdBy === actorId,
    createdByPhone: reporter?.phone || undefined,
    createdByEmail: reporter?.email || undefined,
    createdByRole: reporter?.role || undefined,
  };
}

async function reportersByIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, ReporterInfo>();
  const users = await User.find({ _id: { $in: unique } });
  return new Map(
    users.map((user) => [
      user._id.toString(),
      { phone: user.phone, email: user.email, role: user.role },
    ]),
  );
}

async function loadComplaintForActor(
  actor: { userId: string; role: string; buildingId?: string },
  complaintId: string | string[],
) {
  const id = Array.isArray(complaintId) ? complaintId[0] : complaintId;
  const complaint = await Complaint.findById(id);
  if (!complaint) throw new AppError(404, 'Complaint not found');
  if (!isAppAdmin(actor.role) && actor.buildingId && complaint.buildingId !== actor.buildingId) {
    throw new AppError(403, 'Complaint is not in your building');
  }
  if (!canManageComplaints(actor.role) && complaint.createdBy !== actor.userId) {
    throw new AppError(403, 'You can only view your own tickets');
  }
  return complaint;
}

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const buildings = isAppAdmin(actor.role)
      ? (await Building.find().sort({ name: 1 })).map((b) => b.toSafeJSON())
      : undefined;
    const buildingId = await resolveBuildingId(
      actor,
      req.query.buildingId ? String(req.query.buildingId) : undefined,
      true,
    );

    const filter: Record<string, unknown> = { buildingId };
    if (!canManageComplaints(actor.role)) {
      filter.createdBy = actor.userId;
    }
    const status = String(req.query.status ?? '');
    if (COMPLAINT_STATUSES.includes(status as ComplaintStatus)) {
      filter.status = status;
    }

    const complaints = buildingId
      ? await Complaint.find(filter).sort({ createdAt: -1 }).limit(200)
      : [];
    const reporters = await reportersByIds(complaints.map((item) => item.createdBy));

    res.json({
      success: true,
      data: {
        complaints: complaints.map((item) =>
          complaintDto(req, item, actor.userId, actor.role, reporters.get(item.createdBy)),
        ),
        categories: COMPLAINT_CATEGORIES.map((item) => ({ ...item })),
        statuses: COMPLAINT_STATUSES.map((value) => ({ value, label: complaintStatusLabel(value) })),
        canCreate: canCreateComplaint(actor.role),
        canManage: canManageComplaints(actor.role),
        buildings,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  requireComplaintCreator,
  complaintUpload.array('media', 5),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      const title = String(req.body.title ?? '').trim();
      const description = String(req.body.description ?? '').trim();
      const category = String(req.body.category ?? '').trim();

      if (title.length < 2) throw new AppError(400, 'Enter a complaint title');
      if (description.length < 2) throw new AppError(400, 'Describe the issue');
      if (!COMPLAINT_CATEGORY_VALUES.includes(category as (typeof COMPLAINT_CATEGORY_VALUES)[number])) {
        throw new AppError(400, 'Select a complaint category');
      }

      const buildingId = await resolveBuildingId(
        actor,
        req.body.buildingId ? String(req.body.buildingId) : undefined,
      );
      if (!buildingId) throw new AppError(400, 'Select a building');

      const poster = await User.findById(actor.userId);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const media = files.map((file) => ({
        path: storedComplaintPath(file.filename),
        kind: mediaKind(file.mimetype),
      }));

      const complaint = await Complaint.create({
        buildingId,
        title,
        description,
        category,
        status: 'open',
        media,
        createdBy: actor.userId,
        createdByName: poster?.name?.trim() || 'Resident',
        unitNumber: poster?.unitNumber,
      });

      res.status(201).json({
        success: true,
        message: 'Ticket submitted',
        data: {
          complaint: complaintDto(req, complaint, actor.userId, actor.role, {
            phone: poster?.phone,
            email: poster?.email,
            role: poster?.role,
          }),
        },
      });
    } catch (error) {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => undefined)));
      next(error);
    }
  },
);

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const complaint = await loadComplaintForActor(actor, req.params.id);
    const [comments, reporters] = await Promise.all([
      ComplaintComment.find({ complaintId: complaint._id.toString() }).sort({ createdAt: 1 }),
      reportersByIds([complaint.createdBy]),
    ]);

    res.json({
      success: true,
      data: {
        complaint: complaintDto(req, complaint, actor.userId, actor.role, reporters.get(complaint.createdBy)),
        comments: comments.map((item) => commentDto(req, item)),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    if (!canManageComplaints(actor.role)) {
      throw new AppError(403, 'Only committee and building admins can update tickets');
    }

    const complaint = await loadComplaintForActor(actor, req.params.id);
    const nextStatus = req.body.status ? String(req.body.status) : undefined;
    const commentText = req.body.comment ? String(req.body.comment).trim() : undefined;

    if (nextStatus && !COMPLAINT_STATUSES.includes(nextStatus as ComplaintStatus)) {
      throw new AppError(400, 'Invalid status');
    }

    const poster = await User.findById(actor.userId);
    const authorName = poster?.name?.trim() || 'Committee';

    if (nextStatus && nextStatus !== complaint.status) {
      complaint.status = nextStatus as ComplaintStatus;
      await complaint.save();
      await ComplaintComment.create({
        complaintId: complaint._id.toString(),
        buildingId: complaint.buildingId,
        authorId: actor.userId,
        authorName,
        authorRole: actor.role,
        text: `Status updated to ${complaintStatusLabel(nextStatus)}.`,
        isSystem: true,
      });
    }

    if (commentText) {
      await ComplaintComment.create({
        complaintId: complaint._id.toString(),
        buildingId: complaint.buildingId,
        authorId: actor.userId,
        authorName,
        authorRole: actor.role,
        text: commentText,
      });
    }

    const [comments, reporters] = await Promise.all([
      ComplaintComment.find({ complaintId: complaint._id.toString() }).sort({ createdAt: 1 }),
      reportersByIds([complaint.createdBy]),
    ]);
    res.json({
      success: true,
      message: 'Ticket updated',
      data: {
        complaint: complaintDto(req, complaint, actor.userId, actor.role, reporters.get(complaint.createdBy)),
        comments: comments.map((item) => commentDto(req, item)),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:id/comments',
  complaintUpload.array('media', 5),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      const complaint = await loadComplaintForActor(actor, String(req.params.id));
      if (!canManageComplaints(actor.role) && complaint.createdBy !== actor.userId) {
        throw new AppError(403, 'You cannot comment on this ticket');
      }

      const text = String(req.body.text ?? '').trim();
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (text.length < 1 && !files.length) throw new AppError(400, 'Enter a comment or attach a file');

      const poster = await User.findById(actor.userId);
      const media = files.map((file) => ({
        path: storedComplaintPath(file.filename),
        kind: mediaKind(file.mimetype),
      }));
      const comment = await ComplaintComment.create({
        complaintId: complaint._id.toString(),
        buildingId: complaint.buildingId,
        authorId: actor.userId,
        authorName: poster?.name?.trim() || 'Resident',
        authorRole: actor.role,
        text: text || (media[0]?.kind === 'video' ? 'Sent a video' : media.length ? 'Sent a photo' : ''),
        media,
      });

      res.status(201).json({
        success: true,
        message: 'Comment added',
        data: { comment: commentDto(req, comment) },
      });
    } catch (error) {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => undefined)));
      next(error);
    }
  },
);

export default router;
