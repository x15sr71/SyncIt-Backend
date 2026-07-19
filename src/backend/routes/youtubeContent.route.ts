import express from 'express';
import { getYouTubePlaylistContentHandler } from '../controllers/getYoutubePlaylistContent';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { validate } from '../../middlewares/validate';
import { playlistIdsBody } from '../validation/schemas';

const router = express.Router();

router.post(
  '/youtubePlaylistContent',
  sessionMiddleware,
  validate({ body: playlistIdsBody }),
  getYouTubePlaylistContentHandler,
);

export default router;
