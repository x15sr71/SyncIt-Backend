import express from "express";
import { searchSpotifyTracks } from "../controllers/spotify.controller";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = express.Router();

router.get("/spotifyTracks", sessionMiddleware, searchSpotifyTracks);

export default router;
