import { Router } from 'express';
import { migrateYoutubeToSpotifyHandler } from '../controllers/migrateYoutubeToSpotify';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { userSyncRateLimit } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import { migrateYoutubeToSpotifyBody } from '../validation/schemas';

const router = Router();

// Change from GET to POST
router.post(
  '/youtube-to-spotify',
  sessionMiddleware,
  userSyncRateLimit,
  validate({ body: migrateYoutubeToSpotifyBody }),
  migrateYoutubeToSpotifyHandler,
);

export default router;
