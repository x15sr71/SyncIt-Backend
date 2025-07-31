import express from "express";
import { getYouTubePlaylistContentHandler as get, getYouTubePlaylistContentHandler } from "../controllers/getYoutubePlaylistContent";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = express.Router();

router.post("/youtubePlaylistContent", sessionMiddleware, getYouTubePlaylistContentHandler);

export default router;
