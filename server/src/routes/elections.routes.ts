import fs from 'fs';
import path from 'path';
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { Election } from '../models/Election';
import { ElectionCandidate } from '../models/ElectionCandidate';
import { ElectionVote } from '../models/ElectionVote';
import { Building } from '../models/Building';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest, requireAuth, requireElectionManager } from '../middleware/auth';
import { canCastVote, canManageElections, isAppAdmin } from '../constants/roles';
import { electionPeriodLabel, electionStatus } from '../constants/elections';
import {
  electionsUploadDir,
  ensureUploadDirs,
  publicFileUrl,
  removeStoredFiles,
  storedElectionPath,
} from '../utils/uploads';

const router = Router();
router.use(requireAuth);
ensureUploadDirs();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDirs();
    cb(null, electionsUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
  },
});

const candidateUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//i.test(file.mimetype || '')) {
      cb(new AppError(400, 'Only images are allowed'));
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

function parseDate(value: unknown, label: string): Date {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `Enter a valid ${label}`);
  }
  return date;
}

async function loadElectionForActor(
  actor: { userId: string; role: string; buildingId?: string },
  electionId: string,
) {
  const election = await Election.findById(electionId);
  if (!election) throw new AppError(404, 'Election not found');
  if (!isAppAdmin(actor.role) && actor.buildingId && election.buildingId !== actor.buildingId) {
    throw new AppError(403, 'Election is not in your building');
  }
  return election;
}

async function electionDto(
  req: AuthRequest,
  election: InstanceType<typeof Election>,
  actor: { userId: string; role: string },
  includeCandidates: boolean,
) {
  const status = electionStatus(election.startsAt, election.endsAt);
  const manage = canManageElections(actor.role);
  const myVote = await ElectionVote.findOne({ electionId: election._id.toString(), userId: actor.userId });
  const candidateCount = await ElectionCandidate.countDocuments({ electionId: election._id.toString() });
  const showCounts = election.showResults || manage;
  const totalVotes = showCounts
    ? await ElectionVote.countDocuments({ electionId: election._id.toString() })
    : undefined;

  const base = {
    ...election.toSafeJSON(),
    status,
    periodLabel: electionPeriodLabel(election.startsAt, election.endsAt),
    candidateCount,
    totalVotes,
    showResults: election.showResults,
    canManage: manage,
    canVote: canCastVote(actor.role) && status === 'open' && !myVote,
    canChangeVote: canCastVote(actor.role) && status === 'open' && Boolean(myVote),
    hasVoted: Boolean(myVote),
    myCandidateId: myVote?.candidateId,
    resultsVisible: showCounts,
  };

  if (!includeCandidates) return { election: base };

  const candidates = await ElectionCandidate.find({ electionId: election._id.toString() }).sort({ createdAt: 1 });
  const counts = showCounts
    ? await ElectionVote.aggregate<{ _id: string; count: number }>([
        { $match: { electionId: election._id.toString() } },
        { $group: { _id: '$candidateId', count: { $sum: 1 } } },
      ])
    : [];
  const voteMap = new Map(counts.map((item) => [item._id, item.count]));
  const total = totalVotes ?? 0;

  return {
    election: base,
    candidates: candidates.map((candidate) => {
      const votes = showCounts ? (voteMap.get(candidate._id.toString()) ?? 0) : undefined;
      return {
        ...candidate.toSafeJSON(publicFileUrl(req, candidate.image)),
        votes,
        percent: showCounts && total > 0 ? Math.round(((votes ?? 0) / total) * 100) : showCounts ? 0 : undefined,
      };
    }),
  };
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

    const elections = buildingId
      ? await Election.find({ buildingId }).sort({ startsAt: -1, createdAt: -1 }).limit(50)
      : [];

    res.json({
      success: true,
      data: {
        elections: await Promise.all(elections.map((item) => electionDto(req, item, actor, false).then((d) => d.election))),
        canManage: canManageElections(actor.role),
        buildings,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireElectionManager, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const title = String(req.body.title ?? '').trim();
    const position = String(req.body.position ?? '').trim();
    const description = req.body.description ? String(req.body.description).trim() : undefined;
    const startsAt = parseDate(req.body.startsAt, 'start date');
    const endsAt = parseDate(req.body.endsAt, 'end date');
    const showResults = Boolean(req.body.showResults);

    if (title.length < 2) throw new AppError(400, 'Enter an election title');
    if (position.length < 2) throw new AppError(400, 'Enter the position being voted on');
    if (endsAt <= startsAt) throw new AppError(400, 'End date must be after the start date');

    const buildingId = await resolveBuildingId(
      actor,
      req.body.buildingId ? String(req.body.buildingId) : undefined,
    );
    if (!buildingId) throw new AppError(400, 'Select a building');

    const poster = await User.findById(actor.userId);
    const election = await Election.create({
      buildingId,
      title,
      position,
      description,
      startsAt,
      endsAt,
      showResults,
      createdBy: actor.userId,
      createdByName: poster?.name?.trim() || 'Committee',
    });

    res.status(201).json({
      success: true,
      message: 'Election created',
      data: await electionDto(req, election, actor, true),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const election = await loadElectionForActor(actor, req.params.id);
    res.json({
      success: true,
      data: await electionDto(req, election, actor, true),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireElectionManager, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const election = await loadElectionForActor(actor, req.params.id);

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (title.length < 2) throw new AppError(400, 'Enter an election title');
      election.title = title;
    }
    if (req.body.position !== undefined) {
      const position = String(req.body.position).trim();
      if (position.length < 2) throw new AppError(400, 'Enter the position being voted on');
      election.position = position;
    }
    if (req.body.description !== undefined) {
      election.description = String(req.body.description).trim() || undefined;
    }
    if (req.body.startsAt !== undefined) election.startsAt = parseDate(req.body.startsAt, 'start date');
    if (req.body.endsAt !== undefined) election.endsAt = parseDate(req.body.endsAt, 'end date');
    if (req.body.showResults !== undefined) election.showResults = Boolean(req.body.showResults);
    if (election.endsAt <= election.startsAt) throw new AppError(400, 'End date must be after the start date');

    await election.save();
    res.json({
      success: true,
      message: 'Election updated',
      data: await electionDto(req, election, actor, true),
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireElectionManager, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const election = await loadElectionForActor(actor, req.params.id);
    const candidates = await ElectionCandidate.find({ electionId: election._id.toString() });
    await removeStoredFiles(candidates.map((item) => item.image));
    await ElectionCandidate.deleteMany({ electionId: election._id.toString() });
    await ElectionVote.deleteMany({ electionId: election._id.toString() });
    await election.deleteOne();
    res.json({ success: true, message: 'Election deleted' });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:id/candidates',
  requireElectionManager,
  candidateUpload.single('image'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      const election = await loadElectionForActor(actor, req.params.id);
      if (electionStatus(election.startsAt, election.endsAt) === 'closed') {
        throw new AppError(400, 'Cannot add candidates after voting has closed');
      }

      const name = String(req.body.name ?? '').trim();
      const unitNumber = req.body.unitNumber ? String(req.body.unitNumber).trim() : undefined;
      if (name.length < 2) throw new AppError(400, 'Enter the candidate name');

      const file = req.file;
      const candidate = await ElectionCandidate.create({
        electionId: election._id.toString(),
        buildingId: election.buildingId,
        name,
        unitNumber,
        image: file ? storedElectionPath(file.filename) : undefined,
        createdBy: actor.userId,
      });

      res.status(201).json({
        success: true,
        message: 'Candidate added',
        data: await electionDto(req, election, actor, true),
        candidate: candidate.toSafeJSON(publicFileUrl(req, candidate.image)),
      });
    } catch (error) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
      next(error);
    }
  },
);

router.delete(
  '/:id/candidates/:candidateId',
  requireElectionManager,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.user!;
      const election = await loadElectionForActor(actor, req.params.id);
      const candidate = await ElectionCandidate.findOne({
        _id: req.params.candidateId,
        electionId: election._id.toString(),
      });
      if (!candidate) throw new AppError(404, 'Candidate not found');

      await removeStoredFiles([candidate.image]);
      await ElectionVote.deleteMany({ candidateId: candidate._id.toString() });
      await candidate.deleteOne();

      res.json({
        success: true,
        message: 'Candidate removed',
        data: await electionDto(req, election, actor, true),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/:id/vote', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    if (!canCastVote(actor.role)) {
      throw new AppError(403, 'Only residents can vote');
    }

    const election = await loadElectionForActor(actor, req.params.id);
    if (electionStatus(election.startsAt, election.endsAt) !== 'open') {
      throw new AppError(400, 'Voting is not open for this election');
    }

    const candidateId = String(req.body.candidateId ?? '');
    const candidate = await ElectionCandidate.findOne({
      _id: candidateId,
      electionId: election._id.toString(),
    });
    if (!candidate) throw new AppError(404, 'Candidate not found');

    try {
      await ElectionVote.create({
        electionId: election._id.toString(),
        candidateId: candidate._id.toString(),
        buildingId: election.buildingId,
        userId: actor.userId,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new AppError(409, 'You have already voted in this election');
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: 'Vote recorded',
      data: await electionDto(req, election, actor, true),
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/vote', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    if (!canCastVote(actor.role)) {
      throw new AppError(403, 'Only residents can change a vote');
    }

    const election = await loadElectionForActor(actor, req.params.id);
    if (electionStatus(election.startsAt, election.endsAt) !== 'open') {
      throw new AppError(400, 'You can only change a vote while voting is open');
    }

    const existing = await ElectionVote.findOneAndDelete({
      electionId: election._id.toString(),
      userId: actor.userId,
    });
    if (!existing) {
      throw new AppError(404, 'You have not voted in this election');
    }

    res.json({
      success: true,
      message: 'Vote withdrawn',
      data: await electionDto(req, election, actor, true),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
