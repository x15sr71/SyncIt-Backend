import { Router } from "express";
import sessionMiddleware from "../../../middlewares/sessionMiddleware";
import {
  renameYouTubePlaylistHandler,
  deleteYouTubePlaylistHandler,
  deleteYouTubeSongHandler,
} from "../../controllers/youtubeActions.controller";

const router = Router();

router.post("/rename-playlist", sessionMiddleware, renameYouTubePlaylistHandler);
router.post("/delete-playlist", sessionMiddleware, deleteYouTubePlaylistHandler);
router.post("/delete-song", sessionMiddleware, deleteYouTubeSongHandler);

export default router;
