import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import noticesRoutes from './notices.routes';
import expensesRoutes from './expenses.routes';
import directoryRoutes from './directory.routes';
import marketplaceRoutes from './marketplace.routes';
import electionsRoutes from './elections.routes';
import complaintsRoutes from './complaints.routes';
import inboxRoutes from './inbox.routes';
import amenitiesRoutes from './amenities.routes';
import guestsRoutes from './guests.routes';
import buildingsRoutes from './buildings.routes';
import platformRoutes from './platform.routes';
import { requireAuth } from '../middleware/auth';
import { requireBuildingWriteOnMutations } from '../middleware/buildingAccess';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/platform', platformRoutes);
router.use('/buildings', buildingsRoutes);

const gated = [requireAuth, requireBuildingWriteOnMutations] as const;
router.use('/users', ...gated, usersRoutes);
router.use('/notices', ...gated, noticesRoutes);
router.use('/expenses', ...gated, expensesRoutes);
router.use('/directory', ...gated, directoryRoutes);
router.use('/marketplace', ...gated, marketplaceRoutes);
router.use('/elections', ...gated, electionsRoutes);
router.use('/complaints', ...gated, complaintsRoutes);
router.use('/inbox', ...gated, inboxRoutes);
router.use('/amenities', ...gated, amenitiesRoutes);
router.use('/guests', ...gated, guestsRoutes);

router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Building Management API',
    version: '1.0.0',
    docs: '/api/v1/health',
  });
});

export default router;
