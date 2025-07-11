// src/routes/emptyYouTube.route.ts

import express from "express";
import sessionMiddleware from "../../middlewares/sessionMiddleware";
import { emptyYouTubePlaylist } from "../controllers/emptyYoutubePlaylist";

const router = express.Router();

// POST is preferred here because we're modifying data and expecting playlistId in body
router.get("/emptyYouTubePlaylist", sessionMiddleware, emptyYouTubePlaylist);

export default router;
