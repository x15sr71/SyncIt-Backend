import { Router } from 'express';
import { migrateYoutubeToSpotifyHandler } from '../controllers/migrateYoutubeToSpotify';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { userSyncRateLimit } from '../../middlewares/rateLimit';

const router = Router();

// Change from GET to POST
router.post(
  '/youtube-to-spotify',
  sessionMiddleware,
  userSyncRateLimit,
  migrateYoutubeToSpotifyHandler,
);

export default router;
