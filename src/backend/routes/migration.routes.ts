// src/backend/routes/migration.routes.ts
import { Router } from "express";
import {
  triggerAllMigrationsHandler,
  triggerUserMigrationHandler,
  triggerPlaylistMigrationHandler,
  getCronStatusHandler,
  startCronJobHandler,
  stopCronJobHandler
} from "../controllers/migration.controller";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = Router();

// Manual migration triggers
router.post("/trigger-all", sessionMiddleware, triggerAllMigrationsHandler);
router.post("/trigger-user/:userId", sessionMiddleware, triggerUserMigrationHandler);
router.post("/trigger-playlist/:userId/:playlistId", sessionMiddleware, triggerPlaylistMigrationHandler);

// Cron job management
router.get("/cron/status", sessionMiddleware, getCronStatusHandler);
router.post("/cron/start", sessionMiddleware, startCronJobHandler);
router.post("/cron/stop", sessionMiddleware, stopCronJobHandler);

export default router;
