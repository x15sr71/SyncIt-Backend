import { Router } from "express";
import sessionMiddleware from "../../../middlewares/sessionMiddleware";
import {
  renamePlaylistHandler,
  deletePlaylistHandler,
  deleteSongHandler,
} from "../../controllers/spotifyActions.controller";

const router = Router();

router.post("/rename-playlist", sessionMiddleware, renamePlaylistHandler);
router.post("/delete-playlist", sessionMiddleware, deletePlaylistHandler);
router.post("/delete-song", sessionMiddleware, deleteSongHandler);

export default router;
