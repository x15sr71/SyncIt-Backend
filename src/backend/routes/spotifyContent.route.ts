import express from 'express';
import { getSpotifyPlaylistContentHandler } from '../controllers/getSpotifyPlaylistContent';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { validate } from '../../middlewares/validate';
import { playlistIdsBody } from '../validation/schemas';

const router = express.Router();

router.post(
  '/spotifyPlaylistContent',
  sessionMiddleware,
  validate({ body: playlistIdsBody }),
  getSpotifyPlaylistContentHandler,
);

export default router;
