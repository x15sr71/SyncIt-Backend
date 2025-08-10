// controllers/autoSync.controller.ts

import { Request, Response } from "express";
import { ScheduledSyncService } from "../../backend/services/scheduleSync/scheduledSyncService";
import prisma from "../../db"; // Add this import

// Extend the Request type to include session
interface AuthenticatedRequest extends Request {
  session?: {
    id: string;
  };
}

export async function enableAutoSyncHandler(req: AuthenticatedRequest, res: Response) {
  const userId = req.session?.id as string;
  const {
    playlistId,
    sourcePlatform,
    destinationPlatform,
    intervalMinutes = 60,
  } = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "AUTH_ERROR",
      message: "User session not found.",
    });
  }

  if (!playlistId || !sourcePlatform || !destinationPlatform) {
    return res.status(400).json({
      success: false,
      error: "MISSING_PARAMETERS",
      message: "playlistId, sourcePlatform, and destinationPlatform are required.",
    });
  }

  try {
    const migration = await ScheduledSyncService.enableAutoSync(
      userId,
      playlistId,
      sourcePlatform,
      destinationPlatform,
      intervalMinutes
    );

    res.json({
      success: true,
      migration,
      message: `Auto sync enabled for playlist ${playlistId} (every ${intervalMinutes} minutes)`,
    });
  } catch (error: any) {
    console.error("[Controller] Failed to enable auto sync:", error);
    res.status(500).json({
      success: false,
      error: "ENABLE_AUTO_SYNC_FAILED",
      message: error.message || "Failed to enable auto sync",
    });
  }
}

export async function disableAutoSyncHandler(req: AuthenticatedRequest, res: Response) {
  const userId = req.session?.id as string;
  const { playlistId, sourcePlatform, destinationPlatform } = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "AUTH_ERROR",
      message: "User session not found.",
    });
  }

  try {
    await ScheduledSyncService.disableAutoSync(
      userId,
      playlistId,
      sourcePlatform,
      destinationPlatform
    );

    res.json({
      success: true,
      message: "Auto sync disabled successfully",
    });
  } catch (error: any) {
    console.error("[Controller] Failed to disable auto sync:", error);
    res.status(500).json({
      success: false,
      error: "DISABLE_AUTO_SYNC_FAILED",
      message: error.message || "Failed to disable auto sync",
    });
  }
}

export async function getSyncStatusHandler(req: AuthenticatedRequest, res: Response) {
  const userId = req.session?.id as string;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "AUTH_ERROR",
      message: "User session not found.",
    });
  }

  try {
    const syncStatus = await ScheduledSyncService.getUserSyncStatus(userId);

    res.json({
      success: true,
      syncStatus,
    });
  } catch (error: any) {
    console.error("[Controller] Failed to get sync status:", error);
    res.status(500).json({
      success: false,
      error: "GET_SYNC_STATUS_FAILED",
      message: error.message || "Failed to get sync status",
    });
  }
}

export async function updateSyncIntervalHandler(req: AuthenticatedRequest, res: Response) {
  const userId = req.session?.id as string;
  const {
    playlistId,
    sourcePlatform,
    destinationPlatform,
    intervalMinutes,
  } = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "AUTH_ERROR",
      message: "User session not found.",
    });
  }

  if (!intervalMinutes || intervalMinutes < 10) {
    return res.status(400).json({
      success: false,
      error: "INVALID_INTERVAL",
      message: "Interval must be at least 10 minutes.",
    });
  }

  try {
    await ScheduledSyncService.updateSyncInterval(
      userId,
      playlistId,
      sourcePlatform,
      destinationPlatform,
      intervalMinutes
    );

    res.json({
      success: true,
      message: `Sync interval updated to ${intervalMinutes} minutes`,
    });
  } catch (error: any) {
    console.error("[Controller] Failed to update sync interval:", error);
    res.status(500).json({
      success: false,
      error: "UPDATE_SYNC_INTERVAL_FAILED",
      message: error.message || "Failed to update sync interval",
    });
  }
}

export async function triggerSyncNowHandler(req: AuthenticatedRequest, res: Response) {
  const userId = req.session?.id as string;
  const { playlistId, sourcePlatform, destinationPlatform } = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "AUTH_ERROR",
      message: "User session not found.",
    });
  }

  try {
    // Find the migration record - Use a simpler approach without include for now
    const migration = await prisma.playlistMigration.findFirst({
      where: {
        userId,
        playlistId,
        sourcePlatform,
        destinationPlatform,
      },
    });

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: "MIGRATION_NOT_FOUND",
        message: "Migration record not found",
      });
    }

    // Get user data separately if needed
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        spotifyTokens: true,
        youtubeTokens: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // Create the migration object with user data
    const migrationWithUser = {
      ...migration,
      user: user,
    };

    // Execute the migration immediately
    const result = await ScheduledSyncService.executeMigration(migrationWithUser);

    res.json({
      success: true,
      result,
      message: "Sync executed successfully",
    });
  } catch (error: any) {
    console.error("[Controller] Failed to trigger sync:", error);
    res.status(500).json({
      success: false,
      error: "TRIGGER_SYNC_FAILED",
      message: error.message || "Failed to trigger sync",
    });
  }
}
