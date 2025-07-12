import { Router } from "express";
import { migrateYoutubeToSpotifyHandler } from "../controllers/migrateYoutubeToSpotify";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = Router();

router.get("/youtube-to-spotify", sessionMiddleware, migrateYoutubeToSpotifyHandler);

export default router;
