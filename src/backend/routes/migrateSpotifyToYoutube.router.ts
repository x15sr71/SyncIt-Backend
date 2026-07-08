import { Router } from 'express';
import { migrateSpotifyToYoutubeHandler } from '../controllers/migrateSpotifyToYoutube.controller';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { userSyncRateLimit } from '../../middlewares/rateLimit';

const router = Router();

// Updated to POST method for consistency
router.post(
  '/spotify-to-youtube',
  sessionMiddleware,
  userSyncRateLimit,
  migrateSpotifyToYoutubeHandler,
);

export default router;
