import { Router } from 'express';
import { getYouTubePlaylistsHandler } from '../controllers/getYoutubePlaylists.controller';
import sessionMiddleware from '../../middlewares/sessionMiddleware';

const router = Router();

router.get('/getyoutubeplaylists', sessionMiddleware, getYouTubePlaylistsHandler);

export default router;
