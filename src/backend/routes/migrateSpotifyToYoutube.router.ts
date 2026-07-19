import { Router } from 'express';
import { migrateSpotifyToYoutubeHandler } from '../controllers/migrateSpotifyToYoutube.controller';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { userSyncRateLimit } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import { migrateSpotifyToYoutubeBody } from '../validation/schemas';

const router = Router();

// Updated to POST method for consistency
router.post(
  '/spotify-to-youtube',
  sessionMiddleware,
  userSyncRateLimit,
  validate({ body: migrateSpotifyToYoutubeBody }),
  migrateSpotifyToYoutubeHandler,
);

export default router;
