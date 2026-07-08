// routes/autoSync.routes.ts

import { Router } from 'express';
import {
  enableAutoSyncHandler,
  disableAutoSyncHandler,
  getSyncStatusHandler,
  updateSyncIntervalHandler,
  triggerSyncNowHandler,
} from '../controllers/autoSync.controller';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { userSyncRateLimit } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import {
  autoSyncEnableBody,
  autoSyncTargetBody,
  autoSyncUpdateIntervalBody,
} from '../validation/schemas';

const router = Router();

// Enable auto sync for a playlist
router.post(
  '/enable',
  sessionMiddleware,
  validate({ body: autoSyncEnableBody }),
  enableAutoSyncHandler,
);

// Disable auto sync for a playlist
router.post(
  '/disable',
  sessionMiddleware,
  validate({ body: autoSyncTargetBody }),
  disableAutoSyncHandler,
);

// Get sync status for user's playlists
router.get('/status', sessionMiddleware, getSyncStatusHandler);

// Update sync interval
router.post(
  '/update-interval',
  sessionMiddleware,
  validate({ body: autoSyncUpdateIntervalBody }),
  updateSyncIntervalHandler,
);

// Trigger sync immediately
router.post(
  '/sync-now',
  sessionMiddleware,
  userSyncRateLimit,
  validate({ body: autoSyncTargetBody }),
  triggerSyncNowHandler,
);

export default router;
