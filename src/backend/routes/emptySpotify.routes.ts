import express from 'express';
import sessionMiddleware from '../../middlewares/sessionMiddleware';
import { emptySpotifyPlaylist } from '../controllers/emptySpotify.controller';

const router = express.Router();

// POST, not GET: this is a destructive action, and lax cookies ARE sent on
// cross-site top-level GET navigations — a crafted link could wipe a
// logged-in user's library once the feature is rebuilt (P1-2).
router.post('/emptySpotifyTracks', sessionMiddleware, emptySpotifyPlaylist);

export default router;
