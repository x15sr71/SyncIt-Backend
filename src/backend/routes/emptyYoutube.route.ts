import express from 'express';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { emptyYouTubePlaylist } from '../controllers/emptyYoutubePlaylist';

const router = express.Router();

router.delete('/emptyYouTubePlaylist', sessionMiddleware, emptyYouTubePlaylist);

export default router;
