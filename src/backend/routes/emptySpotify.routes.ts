import express from "express";
import sessionMiddleware from "../../middlewares/sessionMiddleware";
import { emptySpotifyPlaylist } from "../controllers/emptySpotify.controller";

const router = express.Router();

router.get("/spotifyTracks", sessionMiddleware, emptySpotifyPlaylist);

export default router;
