import { Building } from '../models/Building';
import { User } from '../models/User';
import { generateBuildingCode } from '../utils/buildingCode';
import { getPlatformSettings } from '../models/PlatformSettings';

/**
 * Buildings created before join codes existed have no `code`, and the unique index
 * cannot be built while more than one of them is missing the field.
 */
async function backfillBuildingCodes(): Promise<void> {
  const pending = await Building.find({
    $or: [{ code: { $exists: false } }, { code: null }, { code: '' }],
  }).select('_id');

  if (pending.length === 0) return;

  for (const building of pending) {
    let assigned = false;
    for (let attempt = 0; attempt < 10 && !assigned; attempt += 1) {
      const code = generateBuildingCode();
      const taken = await Building.exists({ code });
      if (taken) continue;
      await Building.updateOne({ _id: building._id }, { $set: { code } });
      assigned = true;
    }
    if (!assigned) {
      console.warn(`Could not assign a join code to building ${building._id.toString()}`);
    }
  }

  console.log(`Assigned join codes to ${pending.length} existing building(s)`);
}

/**
 * `email` became optional and `phone` became a login identifier, so both indexes changed
 * shape. A failure here is not fatal: it means legacy duplicate data needs a manual look,
 * and the route handlers still check for collisions before writing.
 */
async function syncIdentityIndexes(): Promise<void> {
  try {
    await Building.syncIndexes();
    await User.syncIndexes();
  } catch (error) {
    console.warn(
      'Could not sync unique indexes — check for duplicate phone numbers or emails:',
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Existing buildings predate access control — keep them fully unlocked.
 * Only buildings missing `accessStatus` are updated (new signups stay locked).
 * Use each building's createdAt as the real activation start (not "now").
 */
async function backfillBuildingAccess(): Promise<void> {
  const result = await Building.updateMany(
    { accessStatus: { $exists: false } },
    [
      {
        $set: {
          accessStatus: 'active',
          trialClaimed: false,
          activatedAt: '$createdAt',
        },
      },
    ],
  );

  if (result.modifiedCount > 0) {
    console.log(`Marked ${result.modifiedCount} existing building(s) as active (no trial)`);
  }
}

/**
 * Repair a bad earlier backfill that stamped every legacy building with the same
 * activatedAt = Date.now(). Shared identical timestamps across 2+ buildings are
 * treated as that batch and reset to each building's createdAt.
 */
async function repairLegacyActivationDates(): Promise<void> {
  const batches = await Building.aggregate<{ _id: Date; count: number; ids: unknown[] }>([
    {
      $match: {
        accessStatus: 'active',
        activatedAt: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$activatedAt',
        count: { $sum: 1 },
        ids: { $push: '$_id' },
      },
    },
    { $match: { count: { $gte: 2 } } },
  ]);

  let repaired = 0;
  for (const batch of batches) {
    const result = await Building.updateMany({ _id: { $in: batch.ids } }, [
      { $set: { activatedAt: '$createdAt' } },
    ]);
    repaired += result.modifiedCount;
  }

  if (repaired > 0) {
    console.log(`Repaired activatedAt on ${repaired} building(s) → using createdAt`);
  }
}

export async function runStartupMigrations(): Promise<void> {
  await backfillBuildingCodes();
  await backfillBuildingAccess();
  await repairLegacyActivationDates();
  await getPlatformSettings();
  await syncIdentityIndexes();
}
