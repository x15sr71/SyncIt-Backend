import express from "express";
import { getSpotifyPlaylistContentHandler } from "../controllers/getSpotifyPlaylistContent";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = express.Router();

router.post("/spotifyPlaylistContent", sessionMiddleware, getSpotifyPlaylistContentHandler);

export default router;
