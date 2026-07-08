import { Router } from 'express';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { validate } from '../../middlewares/validate';
import {
  spotifyRenameBody,
  spotifyDeletePlaylistBody,
  spotifyDeleteSongBody,
} from '../validation/schemas';
import {
  renamePlaylistHandler,
  deletePlaylistHandler,
  deleteSongHandler,
} from '../controllers/spotifyActions.controller';

const router = Router();

router.post(
  '/rename-playlist',
  sessionMiddleware,
  validate({ body: spotifyRenameBody }),
  renamePlaylistHandler,
);
router.post(
  '/delete-playlist',
  sessionMiddleware,
  validate({ body: spotifyDeletePlaylistBody }),
  deletePlaylistHandler,
);
router.post(
  '/delete-song',
  sessionMiddleware,
  validate({ body: spotifyDeleteSongBody }),
  deleteSongHandler,
);

export default router;
