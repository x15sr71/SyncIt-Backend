// routes/autoSync.routes.ts

import { Router } from "express";
import {
  enableAutoSyncHandler,
  disableAutoSyncHandler,
  getSyncStatusHandler,
  updateSyncIntervalHandler,
  triggerSyncNowHandler,
} from "../controllers/autoSync.controller";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = Router();

// Enable auto sync for a playlist
router.post("/enable", sessionMiddleware, enableAutoSyncHandler);

// Disable auto sync for a playlist
router.post("/disable", sessionMiddleware, disableAutoSyncHandler);

// Get sync status for user's playlists
router.get("/status", sessionMiddleware, getSyncStatusHandler);

// Update sync interval
router.post("/update-interval", sessionMiddleware, updateSyncIntervalHandler);

// Trigger sync immediately
router.post("/sync-now", sessionMiddleware, triggerSyncNowHandler);

export default router;
