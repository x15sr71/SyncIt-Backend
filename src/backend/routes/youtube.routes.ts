import express from "express";
import { searchYoutubeTracks } from "../controllers/youtube.controller";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = express.Router();

router.get("/youtubeTrack", sessionMiddleware, searchYoutubeTracks);

export default router;
