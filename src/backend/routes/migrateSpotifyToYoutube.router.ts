import { Router } from "express";
import { migrateSpotifyToYoutubeHandler } from "../controllers/migrateSpotifyToYoutube.controller";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = Router();

// Updated to POST method for consistency
router.post(
  "/spotify-to-youtube",
  sessionMiddleware,
  migrateSpotifyToYoutubeHandler
);

export default router;