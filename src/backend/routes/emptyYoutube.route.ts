import express from 'express';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { validate } from '../../middlewares/validate';
import { emptyYoutubePlaylistBody } from '../validation/schemas';
import { emptyYouTubePlaylist } from '../controllers/emptyYoutubePlaylist';

const router = express.Router();

router.delete(
  '/emptyYouTubePlaylist',
  sessionMiddleware,
  validate({ body: emptyYoutubePlaylistBody }),
  emptyYouTubePlaylist,
);

export default router;
