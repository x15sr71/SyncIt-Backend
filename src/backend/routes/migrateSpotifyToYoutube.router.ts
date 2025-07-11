import { Router } from "express";
import { migrateSpotifyToYoutubeHandler } from "../controllers/migrateSpotifyToYoutube.controller";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = Router();

// POST /api/migrate/spotify-to-youtube
router.get(
  "/spotify-to-youtube",
  sessionMiddleware,
  migrateSpotifyToYoutubeHandler
);

export default router;
