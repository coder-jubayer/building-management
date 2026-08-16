import fs from 'fs';
import path from 'path';
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { User } from '../models/User';
import { Building } from '../models/Building';
import { InboxThread, IInboxThreadDocument } from '../models/InboxThread';
import { InboxMessage } from '../models/InboxMessage';
import { InboxGroup, IInboxGroupDocument, IInboxGroupMember } from '../models/InboxGroup';
import { InboxGroupMessage } from '../models/InboxGroupMessage';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { ROLE_LABELS, isAppAdmin, isCommittee, UserRole } from '../constants/roles';
import {
  ensureUploadDirs,
  groupsUploadDir,
  chatUploadDir,
  publicFileUrl,
  removeStoredFiles,
  storedGroupPath,
  storedChatPath,
} from '../utils/uploads';

const router = Router();
router.use(requireAuth);
ensureUploadDirs();

const chatPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDirs();
    cb(null, chatUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
  },
});

const chatPhotoUpload = multer({
  storage: chatPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//i.test(file.mimetype || '')) {
      cb(new AppError(400, 'Only photos are allowed'));
      return;
    }
    cb(null, true);
  },
});

const groupPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDirs();
    cb(null, groupsUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
  },
});

const groupPhotoUpload = multer({
  storage: groupPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//i.test(file.mimetype || '')) {
      cb(new AppError(400, 'Only images are allowed'));
      return;
    }
    cb(null, true);
  },
});

function groupDto(req: AuthRequest, group: IInboxGroupDocument, actorId: string) {
  return {
    ...group.toSafeJSON(actorId),
    photo: publicFileUrl(req, group.photo),
  };
}

function inboxMessageDto(req: AuthRequest, message: InstanceType<typeof InboxMessage>, actorId: string) {
  return message.toSafeJSON(actorId, publicFileUrl(req, message.image));
}

function groupMessageDto(
  req: AuthRequest,
  message: InstanceType<typeof InboxGroupMessage>,
  actorId: string,
  memberIds: string[],
) {
  return message.toSafeJSON(actorId, memberIds, publicFileUrl(req, message.image));
}

export type InboxCategory = 'committee' | 'resident' | 'guard';

function pairIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function inboxThreadDto(
  thread: IInboxThreadDocument,
  actor: { userId: string; role: string },
) {
  const json = thread.toSafeJSON(actor.userId);
  return {
    ...json,
    pinned: isCommittee(actor.role) && json.otherRole === 'building_admin',
  };
}

function isPinnedAdminThread(thread: IInboxThreadDocument, actorId: string, actorRole: string) {
  const otherRole = thread.userA === actorId ? thread.userBRole : thread.userARole;
  return isCommittee(actorRole) && otherRole === 'building_admin';
}

async function ensureCommitteeAdminThreads(actor: { userId: string; role: string; buildingId?: string }) {
  if (!isCommittee(actor.role) || !actor.buildingId) return;

  const [me, admins] = await Promise.all([
    User.findById(actor.userId),
    User.find({
      buildingId: actor.buildingId,
      role: 'building_admin',
      isActive: true,
      _id: { $ne: actor.userId },
    }),
  ]);
  if (!me || !admins.length) return;

  for (const admin of admins) {
    const otherId = admin._id.toString();
    const [userA, userB] = pairIds(actor.userId, otherId);
    const existing = await InboxThread.findOne({ userA, userB });
    if (existing) continue;

    const aIsMe = userA === actor.userId;
    await InboxThread.create({
      buildingId: actor.buildingId,
      userA,
      userB,
      userAName: aIsMe ? me.name : admin.name,
      userBName: aIsMe ? admin.name : me.name,
      userARole: aIsMe ? me.role : admin.role,
      userBRole: aIsMe ? admin.role : me.role,
    });
  }
}

function inboxCategory(role?: string | null): InboxCategory | null {
  if (role === 'committee') return 'committee';
  if (role === 'resident') return 'resident';
  if (role === 'guard') return 'guard';
  return null;
}

async function resolveBuildingId(
  actor: { role: string; buildingId?: string },
  requested?: string,
): Promise<string> {
  if (isAppAdmin(actor.role)) {
    if (requested) {
      const building = await Building.findById(requested);
      if (!building) throw new AppError(404, 'Building not found');
      return building._id.toString();
    }
    const first = await Building.findOne().sort({ name: 1 });
    if (!first) throw new AppError(400, 'No building found');
    return first._id.toString();
  }
  if (!actor.buildingId) {
    throw new AppError(400, 'Your account is not linked to a building');
  }
  return actor.buildingId;
}

async function markInboxSeen(threadId: string, actorId: string) {
  await InboxMessage.updateMany(
    { threadId, senderId: { $ne: actorId }, seenAt: null },
    { $set: { seenAt: new Date() } },
  );
}

async function loadThreadForActor(threadId: string, actorId: string, actorRole: string) {
  const thread = await InboxThread.findById(threadId);
  if (!thread) throw new AppError(404, 'Conversation not found');
  if (thread.userA !== actorId && thread.userB !== actorId && !isAppAdmin(actorRole)) {
    throw new AppError(403, 'You cannot view this conversation');
  }
  return thread;
}

router.get('/directory', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const buildingId = await resolveBuildingId(
      actor,
      req.query.buildingId ? String(req.query.buildingId) : undefined,
    );

    const users = await User.find({
      buildingId,
      isActive: true,
      _id: { $ne: actor.userId },
      role: { $in: ['committee', 'resident', 'guard'] },
    }).sort({ name: 1 });

    const threads = await InboxThread.find({
      $or: [{ userA: actor.userId }, { userB: actor.userId }],
    });
    const threadByOther = new Map(
      threads.map((thread) => [thread.userA === actor.userId ? thread.userB : thread.userA, thread]),
    );

    type DirectoryContact = {
      id: string;
      name: string;
      role: string;
      roleLabel: string;
      phone?: string;
      email?: string;
      unitNumber?: string;
      threadId?: string;
      lastMessage?: string;
      lastMessageAt?: string;
      inInbox: boolean;
      unread: number;
    };

    const grouped: Record<InboxCategory, DirectoryContact[]> = {
      committee: [],
      resident: [],
      guard: [],
    };

    function contactDto(user: (typeof users)[number]): DirectoryContact {
      const thread = threadByOther.get(user._id.toString());
      const isA = thread?.userA === actor.userId;
      return {
        id: user._id.toString(),
        name: user.name,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role as UserRole] ?? user.role,
        phone: user.phone,
        email: user.email,
        unitNumber: user.unitNumber,
        threadId: thread?._id.toString(),
        lastMessage: thread?.lastMessage,
        lastMessageAt: thread?.lastMessageAt?.toISOString(),
        inInbox: Boolean(thread),
        unread: thread && (isA ? thread.userAUnread : thread.userBUnread) > 0 ? 1 : 0,
      };
    }

    for (const user of users) {
      const category = inboxCategory(user.role);
      if (!category) continue;
      grouped[category].push(contactDto(user));
    }

    res.json({
      success: true,
      data: {
        buildingId,
        categories: [
          { value: 'committee', label: 'Committee', count: grouped.committee.length },
          { value: 'resident', label: 'Resident', count: grouped.resident.length },
          { value: 'guard', label: 'Security Guard', count: grouped.guard.length },
        ],
        contacts: grouped,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/threads', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    await ensureCommitteeAdminThreads(actor);

    const threads = await InboxThread.find({
      $or: [{ userA: actor.userId }, { userB: actor.userId }],
    }).limit(250);

    const visible = threads
      .filter((thread) => Boolean(thread.lastMessageAt) || isPinnedAdminThread(thread, actor.userId, actor.role))
      .map((thread) => inboxThreadDto(thread, actor))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const left = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const right = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return right - left;
      })
      .slice(0, 200);

    res.json({
      success: true,
      data: { threads: visible },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/threads', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const otherId = String(req.body.userId ?? '').trim();
    if (!otherId) throw new AppError(400, 'Select a person to message');
    if (otherId === actor.userId) throw new AppError(400, 'You cannot message yourself');

    const [me, other] = await Promise.all([User.findById(actor.userId), User.findById(otherId)]);
    if (!me || !other || !other.isActive) throw new AppError(404, 'User not found');
    if (!isAppAdmin(actor.role) && me.buildingId && other.buildingId && me.buildingId !== other.buildingId) {
      throw new AppError(403, 'You can only message people in your building');
    }

    const [userA, userB] = pairIds(actor.userId, otherId);
    let thread = await InboxThread.findOne({ userA, userB });
    if (!thread) {
      const buildingId = other.buildingId || me.buildingId;
      if (!buildingId) throw new AppError(400, 'Select a building');
      const aIsMe = userA === actor.userId;
      thread = await InboxThread.create({
        buildingId,
        userA,
        userB,
        userAName: aIsMe ? me.name : other.name,
        userBName: aIsMe ? other.name : me.name,
        userARole: aIsMe ? me.role : other.role,
        userBRole: aIsMe ? other.role : me.role,
      });
    }

    if (thread.userA === actor.userId) thread.userAUnread = 0;
    else thread.userBUnread = 0;
    await thread.save();
    await markInboxSeen(thread._id.toString(), actor.userId);

    const messages = await InboxMessage.find({ threadId: thread._id.toString() }).sort({ createdAt: 1 }).limit(500);

    res.status(201).json({
      success: true,
      data: {
        thread: inboxThreadDto(thread, actor),
        messages: messages.map((item) => inboxMessageDto(req, item, actor.userId)),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/threads/:threadId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const thread = await loadThreadForActor(String(req.params.threadId), actor.userId, actor.role);

    if (thread.userA === actor.userId) thread.userAUnread = 0;
    if (thread.userB === actor.userId) thread.userBUnread = 0;
    await thread.save();
    await markInboxSeen(thread._id.toString(), actor.userId);

    const messages = await InboxMessage.find({ threadId: thread._id.toString() }).sort({ createdAt: 1 }).limit(500);

    res.json({
      success: true,
      data: {
        thread: inboxThreadDto(thread, actor),
        messages: messages.map((item) => inboxMessageDto(req, item, actor.userId)),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/threads/:threadId/messages',
  chatPhotoUpload.single('image'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      const text = String(req.body.text ?? '').trim();
      const file = req.file;
      if (text.length < 1 && !file) throw new AppError(400, 'Message cannot be empty');

      const thread = await loadThreadForActor(String(req.params.threadId), actor.userId, actor.role);
      if (thread.userA !== actor.userId && thread.userB !== actor.userId) {
        throw new AppError(403, 'You cannot message this conversation');
      }

      const poster = await User.findById(actor.userId);
      const senderName = poster?.name?.trim() || 'Resident';
      const image = file ? storedChatPath(file.filename) : undefined;
      const message = await InboxMessage.create({
        threadId: thread._id.toString(),
        senderId: actor.userId,
        senderName,
        text: text || (image ? 'Sent a photo' : ''),
        image,
      });

      thread.lastMessage = text || 'Photo';
      thread.lastMessageAt = message.createdAt;
      if (actor.userId === thread.userA) thread.userBUnread = 1;
      else thread.userAUnread = 1;
      await thread.save();

      res.status(201).json({
        success: true,
        data: {
          message: inboxMessageDto(req, message, actor.userId),
          thread: inboxThreadDto(thread, actor),
        },
      });
    } catch (error) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
      next(error);
    }
  },
);

async function loadGroupForActor(groupId: string, actorId: string, actorRole: string) {
  const group = await InboxGroup.findById(groupId);
  if (!group) throw new AppError(404, 'Group not found');
  if (!group.memberIds.includes(actorId) && !isAppAdmin(actorRole)) {
    throw new AppError(403, 'You are not in this group');
  }
  return group;
}

async function memberSnapshots(ids: string[]): Promise<IInboxGroupMember[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const users = await User.find({ _id: { $in: unique }, isActive: true });
  const byId = new Map(users.map((user) => [user._id.toString(), user]));
  return unique.flatMap((id) => {
    const user = byId.get(id);
    if (!user) return [];
    return [
      {
        id: user._id.toString(),
        name: user.name,
        role: user.role,
        phone: user.phone,
        unitNumber: user.unitNumber,
      },
    ];
  });
}

router.get('/groups', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const groups = await InboxGroup.find({ memberIds: actor.userId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(200);
    res.json({
      success: true,
      data: { groups: groups.map((group) => groupDto(req, group, actor.userId)) },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/groups', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const name = String(req.body.name ?? '').trim();
    const requestedIds = Array.isArray(req.body.memberIds)
      ? req.body.memberIds.map((id: unknown) => String(id).trim()).filter((id: string) => id.length > 0)
      : [];
    if (name.length < 2) throw new AppError(400, 'Enter a group name');

    const buildingId = await resolveBuildingId(
      actor,
      req.body.buildingId ? String(req.body.buildingId) : undefined,
    );
    const memberIds = [...new Set([actor.userId, ...requestedIds])];
    if (memberIds.length < 2) throw new AppError(400, 'Add at least one person to the group');

    const members = await memberSnapshots(memberIds);
    if (members.length < 2) throw new AppError(400, 'Some selected people could not be added');
    if (!isAppAdmin(actor.role)) {
      const users = await User.find({ _id: { $in: memberIds } });
      if (users.some((user) => user.buildingId && user.buildingId !== buildingId)) {
        throw new AppError(403, 'You can only add people from your building');
      }
    }

    const group = await InboxGroup.create({
      buildingId,
      name,
      createdBy: actor.userId,
      memberIds: members.map((item) => item.id),
      members,
      unreadIds: [],
    });

    res.status(201).json({
      success: true,
      data: { group: groupDto(req, group, actor.userId), messages: [] },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/groups/:groupId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const group = await loadGroupForActor(String(req.params.groupId), actor.userId, actor.role);
    group.unreadIds = (group.unreadIds || []).filter((id) => id !== actor.userId);
    await group.save();
    await InboxGroupMessage.updateMany(
      { groupId: group._id.toString(), seenBy: { $ne: actor.userId } },
      { $addToSet: { seenBy: actor.userId } },
    );
    const messages = await InboxGroupMessage.find({ groupId: group._id.toString() })
      .sort({ createdAt: 1 })
      .limit(500);
    res.json({
      success: true,
      data: {
        group: groupDto(req, group, actor.userId),
        messages: messages.map((item) => groupMessageDto(req, item, actor.userId, group.memberIds)),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/groups/:groupId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const group = await loadGroupForActor(String(req.params.groupId), actor.userId, actor.role);
    const name = String(req.body.name ?? '').trim();
    if (name.length < 2) throw new AppError(400, 'Enter a group name');
    group.name = name;
    await group.save();
    res.json({
      success: true,
      data: { group: groupDto(req, group, actor.userId) },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/groups/:groupId/photo',
  groupPhotoUpload.single('photo'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      const file = req.file;
      if (!file) throw new AppError(400, 'Choose a group photo');
      const group = await loadGroupForActor(String(req.params.groupId), actor.userId, actor.role);
      const previous = group.photo;
      group.photo = storedGroupPath(file.filename);
      await group.save();
      if (previous) await removeStoredFiles([previous]);
      res.json({
        success: true,
        data: { group: groupDto(req, group, actor.userId) },
      });
    } catch (error) {
      const file = req.file;
      if (file) await fs.promises.unlink(file.path).catch(() => undefined);
      next(error);
    }
  },
);

router.post('/groups/:groupId/members', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const group = await loadGroupForActor(String(req.params.groupId), actor.userId, actor.role);
    const requestedIds: string[] = Array.isArray(req.body.memberIds)
      ? req.body.memberIds.map((id: unknown) => String(id).trim()).filter((id: string) => id.length > 0)
      : [];
    if (!requestedIds.length) throw new AppError(400, 'Select people to add');

    const existing = new Set(group.memberIds);
    const freshIds = [...new Set(requestedIds)].filter((id) => !existing.has(id));
    if (!freshIds.length) throw new AppError(400, 'Those people are already in this group');

    const nextIds = [...group.memberIds, ...freshIds];
    const members = await memberSnapshots(nextIds);
    if (!isAppAdmin(actor.role)) {
      const users = await User.find({ _id: { $in: requestedIds } });
      if (users.some((user) => user.buildingId && user.buildingId !== group.buildingId)) {
        throw new AppError(403, 'You can only add people from your building');
      }
    }
    group.memberIds = members.map((item) => item.id);
    group.members = members;
    await group.save();
    res.json({
      success: true,
      data: { group: groupDto(req, group, actor.userId) },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/groups/:groupId/messages',
  chatPhotoUpload.single('image'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      const text = String(req.body.text ?? '').trim();
      const file = req.file;
      if (text.length < 1 && !file) throw new AppError(400, 'Message cannot be empty');

      const group = await loadGroupForActor(String(req.params.groupId), actor.userId, actor.role);
      const poster = await User.findById(actor.userId);
      const senderName = poster?.name?.trim() || 'Resident';
      const image = file ? storedChatPath(file.filename) : undefined;
      const message = await InboxGroupMessage.create({
        groupId: group._id.toString(),
        senderId: actor.userId,
        senderName,
        text: text || (image ? 'Sent a photo' : ''),
        image,
        seenBy: [actor.userId],
      });

      group.lastMessage = text || 'Photo';
      group.lastMessageAt = message.createdAt;
      group.unreadIds = group.memberIds.filter((id) => id !== actor.userId);
      await group.save();

      res.status(201).json({
        success: true,
        data: {
          message: groupMessageDto(req, message, actor.userId, group.memberIds),
          group: groupDto(req, group, actor.userId),
        },
      });
    } catch (error) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
      next(error);
    }
  },
);

export default router;
