import { env } from '../config/env';
import { User } from '../models/User';
import { Building } from '../models/Building';
import { Notice } from '../models/Notice';
import { Expense } from '../models/Expense';
import { DirectoryContact } from '../models/DirectoryContact';
import { MarketplaceListing } from '../models/MarketplaceListing';
import { Election } from '../models/Election';
import { ElectionCandidate } from '../models/ElectionCandidate';
import { Complaint } from '../models/Complaint';
import { ComplaintComment } from '../models/ComplaintComment';

const ADMIN_EMAIL = 'admin@bm.com';
const ADMIN_PASSWORD = 'admin123';

async function seedProductionAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    const existingAdmin = await User.findOne({ role: 'app_admin' });
    if (!existingAdmin) {
      console.warn('No app_admin user found. Set ADMIN_EMAIL and ADMIN_PASSWORD on first boot.');
    }
    return;
  }

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'app_admin') {
      await User.collection.updateOne(
        { _id: existing._id },
        { $set: { role: 'app_admin' }, $unset: { buildingId: 1 } },
      );
      console.log(`Existing user promoted to app_admin (${email})`);
    }
    return;
  }

  await User.create({
    name: 'App Admin',
    email,
    password,
    role: 'app_admin',
  });
  console.log(`Production app admin created (${email})`);
}

export async function seedAdminUser(): Promise<void> {
  await User.collection.updateMany({ role: 'admin' }, { $set: { role: 'app_admin' } });
  await User.collection.updateMany({ role: 'treasurer' }, { $set: { role: 'committee' } });

  if (env.isProduction && process.env.SEED_DEMO !== 'true') {
    await seedProductionAdmin();
    return;
  }

  let defaultBuilding = await Building.findOne({ name: 'Default Community' });
  if (!defaultBuilding) {
    defaultBuilding = await Building.create({ name: 'Default Community' });
  }

  await User.collection.updateMany(
    {
      role: { $ne: 'app_admin' },
      $or: [
        { buildingId: { $exists: false } },
        { buildingId: null },
        { buildingId: '' },
        { buildingId: 'building-1' },
      ],
    },
    { $set: { buildingId: defaultBuilding._id.toString() } },
  );

  await seedSampleNotices(defaultBuilding._id.toString());
  await seedSampleExpenses(defaultBuilding._id.toString());
  await seedSampleDirectory(defaultBuilding._id.toString());

  const committeeEmail = 'committee@bm.com';
  const existingCommittee = await User.findOne({ email: committeeEmail });
  if (!existingCommittee) {
    try {
      await User.create({
        name: 'Committee Member',
        email: committeeEmail,
        password: 'committee123',
        role: 'committee',
        phone: '+8801711000088',
        buildingId: defaultBuilding._id.toString(),
      });
      console.log(`Committee user seeded (${committeeEmail})`);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  } else if (!existingCommittee.phone) {
    await User.updateOne({ email: committeeEmail }, { $set: { phone: '+8801711000088' } });
  }

  const residentEmail = 'resident1@bm.com';
  const existingResident = await User.findOne({ email: residentEmail });
  if (!existingResident) {
    try {
      await User.create({
        name: 'Resident One',
        email: residentEmail,
        password: 'resident123',
        role: 'resident',
        phone: '+8801711000099',
        unitNumber: 'A-101',
        buildingId: defaultBuilding._id.toString(),
      });
      console.log(`Resident user seeded (${residentEmail})`);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  } else if (!existingResident.phone) {
    await User.updateOne({ email: residentEmail }, { $set: { phone: '+8801711000099' } });
  }

  const guardEmail = 'guard@bm.com';
  const existingGuard = await User.findOne({ email: guardEmail });
  if (!existingGuard) {
    try {
      await User.create({
        name: 'Security Guard',
        email: guardEmail,
        password: 'guard123',
        role: 'guard',
        phone: '+8801711000077',
        buildingId: defaultBuilding._id.toString(),
      });
      console.log(`Guard user seeded (${guardEmail})`);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  } else if (!existingGuard.phone) {
    await User.updateOne({ email: guardEmail }, { $set: { phone: '+8801711000077' } });
  }

  await User.updateOne({ email: committeeEmail }, { $set: { phone: '+8801711000088' } });
  await User.updateOne({ email: residentEmail }, { $set: { phone: '+8801711000099' } });
  await User.updateOne({ email: guardEmail }, { $set: { phone: '+8801711000077' } });

  await seedSampleMarketplace(defaultBuilding._id.toString());
  await seedSampleElection(defaultBuilding._id.toString());
  await seedSampleComplaints(defaultBuilding._id.toString());

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    await User.collection.updateOne(
      { _id: existing._id },
      { $set: { role: 'app_admin', name: existing.name === 'Building Admin' ? 'App Admin' : existing.name }, $unset: { buildingId: 1 } },
    );
    console.log(
      existing.role === 'app_admin' && !existing.buildingId
        ? 'App admin already exists'
        : 'Existing admin promoted to App Admin',
    );
    return;
  }

  await User.create({
    name: 'App Admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'app_admin',
  });

  console.log(`App admin seeded (${ADMIN_EMAIL})`);
}

async function seedSampleNotices(buildingId: string): Promise<void> {
  const count = await Notice.countDocuments({ buildingId });
  if (count > 0) return;

  await Notice.insertMany([
    {
      title: 'Water Supply Interruption',
      body: 'There will be no water supply on Friday from 10 AM to 2 PM due to maintenance.',
      buildingId,
      createdBy: 'seed',
      authorName: 'Committee',
      createdAt: new Date(),
    },
    {
      title: 'Annual General Meeting',
      body: 'The AGM will be held on the 15th of next month in the Community Hall.',
      buildingId,
      createdBy: 'seed',
      authorName: 'Committee',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
    {
      title: 'Lift 2 Maintenance',
      body: 'Lift 2 will be under maintenance this weekend.',
      buildingId,
      createdBy: 'seed',
      authorName: 'Maintenance',
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  ]);

  console.log('Sample notices seeded');
}

async function seedSampleExpenses(buildingId: string): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const count = await Expense.countDocuments({ buildingId, year, month, addedBy: 'seed' });
  if (count > 0) return;

  await Expense.insertMany([
    { year, month, buildingId, category: 'guard_salary', amount: 45000, addedBy: 'seed', addedByName: 'Committee' },
    { year, month, buildingId, category: 'electricity', amount: 32000, addedBy: 'seed', addedByName: 'Committee' },
    { year, month, buildingId, category: 'lift', amount: 15000, addedBy: 'seed', addedByName: 'Committee' },
    { year, month, buildingId, category: 'cleaner_salary', amount: 12000, addedBy: 'seed', addedByName: 'Committee' },
    { year, month, buildingId, category: 'wasa', amount: 8000, addedBy: 'seed', addedByName: 'Committee' },
    { year, month, buildingId, category: 'other', amount: 5000, note: 'Miscellaneous supplies', addedBy: 'seed', addedByName: 'Committee' },
  ]);

  console.log(`Sample expenses seeded for ${month}/${year}`);
}

async function seedSampleDirectory(buildingId: string): Promise<void> {
  const count = await DirectoryContact.countDocuments({ buildingId, createdBy: 'seed' });
  if (count > 0) return;

  await DirectoryContact.insertMany([
    { buildingId, type: 'fire', name: 'Dhaka Fire Service', phone: '199', createdBy: 'seed', createdByName: 'Committee' },
    { buildingId, type: 'police', name: 'Local Police Station', phone: '999', createdBy: 'seed', createdByName: 'Committee' },
    { buildingId, type: 'property_manager', name: 'Property Manager', phone: '+8801711000001', createdBy: 'seed', createdByName: 'Committee' },
    { buildingId, type: 'security', name: 'Main Gate Security', phone: '+8801711000002', createdBy: 'seed', createdByName: 'Committee' },
    { buildingId, type: 'gas', name: 'Titas Gas Supplier', phone: '+8801711000003', createdBy: 'seed', createdByName: 'Committee' },
    { buildingId, type: 'welfare', name: 'Welfare Society Help Desk', phone: '+8801711000004', createdBy: 'seed', createdByName: 'Committee' },
  ]);

  console.log('Sample directory contacts seeded');
}

async function seedSampleMarketplace(buildingId: string): Promise<void> {
  const count = await MarketplaceListing.countDocuments({ buildingId });
  if (count > 0) return;

  const committee = await User.findOne({ email: 'committee@bm.com' });
  const resident = await User.findOne({ email: 'resident1@bm.com' });
  const seller = resident || committee;
  if (!seller) return;

  await MarketplaceListing.insertMany([
    {
      buildingId,
      title: 'Wooden study table',
      description: 'Solid wood study table with a matching chair. Barely used, pickup from the building.',
      price: 4500,
      images: [],
      sellerId: seller._id.toString(),
      sellerName: seller.name,
      sellerPhone: seller.phone || '+8801711000099',
      sellerEmail: seller.email,
    },
    {
      buildingId,
      title: 'Kids bicycle',
      description: '16-inch kids bike in good condition. Suitable for ages 4–7.',
      price: 2800,
      images: [],
      sellerId: seller._id.toString(),
      sellerName: seller.name,
      sellerPhone: seller.phone || '+8801711000099',
      sellerEmail: seller.email,
    },
  ]);

  console.log('Sample marketplace listings seeded');
}

async function seedSampleElection(buildingId: string): Promise<void> {
  const count = await Election.countDocuments({ buildingId });
  if (count > 0) return;

  const committee = await User.findOne({ email: 'committee@bm.com' });
  const now = new Date();
  const startsAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const election = await Election.create({
    buildingId,
    title: 'Committee Election 2026',
    position: 'President',
    description: 'Select one candidate for President.',
    startsAt,
    endsAt,
    showResults: true,
    createdBy: committee?._id.toString() || 'seed',
    createdByName: committee?.name || 'Committee',
  });

  await ElectionCandidate.insertMany([
    {
      electionId: election._id.toString(),
      buildingId,
      name: 'Robert Chen',
      unitNumber: 'A-104',
      createdBy: election.createdBy,
    },
    {
      electionId: election._id.toString(),
      buildingId,
      name: 'Sarah Jenkins',
      unitNumber: 'B-204',
      createdBy: election.createdBy,
    },
    {
      electionId: election._id.toString(),
      buildingId,
      name: 'Michael Ross',
      unitNumber: 'C-301',
      createdBy: election.createdBy,
    },
  ]);

  console.log('Sample election seeded');
}

async function seedSampleComplaints(buildingId: string): Promise<void> {
  const count = await Complaint.countDocuments({ buildingId });
  if (count > 0) return;

  const resident = await User.findOne({ email: 'resident1@bm.com' });
  const committee = await User.findOne({ email: 'committee@bm.com' });
  const creator = resident || committee;
  if (!creator) return;

  const [leaking, ac, lobby] = await Complaint.insertMany([
    {
      buildingId,
      title: 'Leaking pipe in bathroom',
      description: 'Water is dripping under the sink in the master bathroom.',
      category: 'plumbing',
      status: 'in_progress',
      media: [],
      createdBy: creator._id.toString(),
      createdByName: creator.name,
      unitNumber: creator.unitNumber || 'A-101',
      createdAt: new Date(),
    },
    {
      buildingId,
      title: 'AC not cooling',
      description: 'Living room AC runs but blows warm air.',
      category: 'hvac',
      status: 'open',
      media: [],
      createdBy: creator._id.toString(),
      createdByName: creator.name,
      unitNumber: creator.unitNumber || 'A-101',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
    {
      buildingId,
      title: 'Lobby light broken',
      description: 'The light near the lift lobby on floor 2 is out.',
      category: 'common_area',
      status: 'resolved',
      media: [],
      createdBy: creator._id.toString(),
      createdByName: creator.name,
      unitNumber: creator.unitNumber || 'A-101',
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
  ]);

  if (committee) {
    await ComplaintComment.insertMany([
      {
        complaintId: leaking._id.toString(),
        buildingId,
        authorId: committee._id.toString(),
        authorName: committee.name,
        authorRole: 'committee',
        text: 'Plumber scheduled for tomorrow morning.',
      },
      {
        complaintId: lobby._id.toString(),
        buildingId,
        authorId: committee._id.toString(),
        authorName: committee.name,
        authorRole: 'committee',
        text: 'Bulb replaced. Please confirm if it is working.',
      },
    ]);
  }

  console.log('Sample complaints seeded');
}
