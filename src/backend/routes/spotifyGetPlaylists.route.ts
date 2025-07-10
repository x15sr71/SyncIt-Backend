import { Router } from "express";
import { getPlaylistsHandler } from "../controllers/getSpotifyPlaylists.controller";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = Router();

router.get("/getSpotifyplaylists", sessionMiddleware, getPlaylistsHandler);

export default router;
    