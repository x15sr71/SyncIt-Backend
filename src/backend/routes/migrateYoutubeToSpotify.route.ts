import { Router } from "express";
import { migrateYoutubeToSpotifyHandler } from "../controllers/migrateYoutubeToSpotify";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = Router();

// Change from GET to POST
router.post("/youtube-to-spotify", sessionMiddleware, migrateYoutubeToSpotifyHandler);

export default router;