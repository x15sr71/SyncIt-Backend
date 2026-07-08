import { Router } from 'express';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { validate } from '../../middlewares/validate';
import {
  youtubeRenameBody,
  youtubeDeletePlaylistBody,
  youtubeDeleteSongBody,
} from '../validation/schemas';
import {
  renameYouTubePlaylistHandler,
  deleteYouTubePlaylistHandler,
  deleteYouTubeSongHandler,
} from '../controllers/youtubeActions.controller';

const router = Router();

router.post(
  '/rename-playlist',
  sessionMiddleware,
  validate({ body: youtubeRenameBody }),
  renameYouTubePlaylistHandler,
);
router.post(
  '/delete-playlist',
  sessionMiddleware,
  validate({ body: youtubeDeletePlaylistBody }),
  deleteYouTubePlaylistHandler,
);
router.post(
  '/delete-song',
  sessionMiddleware,
  validate({ body: youtubeDeleteSongBody }),
  deleteYouTubeSongHandler,
);

export default router;
