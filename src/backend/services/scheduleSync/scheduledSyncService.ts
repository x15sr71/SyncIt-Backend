// services/scheduleSync/scheduledSyncService.ts

import prisma from "../../../db";
import { migrateSpotifyPlaylistToYoutube } from "../migration/spotifyToYoutube";
import { migrateYoutubePlaylistToSpotify } from "../migration/youtubeToSpotify";

export class ScheduledSyncService {
  // Enable auto sync for a playlist migration
  static async enableAutoSync(
    userId: string,
    playlistId: string,
    sourcePlatform: string,
    destinationPlatform: string,
    intervalMinutes: number = 60
  ) {
    const nextSyncAt = new Date(Date.now() + intervalMinutes * 60 * 1000);
    
    return await prisma.playlistMigration.upsert({
      where: {
        userId_playlistId_sourcePlatform_destinationPlatform: {
          userId,
          playlistId,
          sourcePlatform,
          destinationPlatform,
        },
      },
      update: {
        autoSyncEnabled: true,
        syncIntervalMinutes: intervalMinutes,
        nextSyncAt,
        lastSyncStatus: null,
        lastSyncError: null,
      },
      create: {
        userId,
        playlistId,
        sourcePlatform,
        destinationPlatform,
        sourceTrackIds: [],
        migrationCounter: 0,
        autoSyncEnabled: true,
        syncIntervalMinutes: intervalMinutes,
        nextSyncAt,
      },
    });
  }

  // Disable auto sync for a playlist migration
  static async disableAutoSync(
    userId: string,
    playlistId: string,
    sourcePlatform: string,
    destinationPlatform: string
  ) {
    return await prisma.playlistMigration.updateMany({
      where: {
        userId,
        playlistId,
        sourcePlatform,
        destinationPlatform,
      },
      data: {
        autoSyncEnabled: false,
        nextSyncAt: null,
      },
    });
  }

  // Get all migrations that need to run
  static async getMigrationsToRun() {
    return await prisma.playlistMigration.findMany({
      where: {
        autoSyncEnabled: true,
        nextSyncAt: {
          lte: new Date(),
        },
      },
      include: {
        user: {
          include: {
            spotifyTokens: true,
            youtubeTokens: true,
          },
        },
      },
    });
  }

  // Execute a scheduled migration - FINAL PRODUCTION VERSION
  static async executeMigration(migration: any) {
    try {
      console.log(`[ScheduledSync] Starting migration for playlist ${migration.playlistId}`);

      let result;
      
      if (
        migration.sourcePlatform === "SPOTIFY" &&
        migration.destinationPlatform === "YOUTUBE"
      ) {
        // Spotify → YouTube migration
        // Use your existing service with "auto-create" - it handles everything
        result = await migrateSpotifyPlaylistToYoutube(
          migration.userId,
          migration.playlistId,        // Source Spotify playlist ID
          "auto-create"                // Your service handles YouTube playlist creation
        );
      } else if (
        migration.sourcePlatform === "YOUTUBE" &&
        migration.destinationPlatform === "SPOTIFY"
      ) {
        // YouTube → Spotify migration  
        // Use playlist ID as name - your service handles this gracefully
        result = await migrateYoutubePlaylistToSpotify(
          migration.userId,
          migration.playlistId,        // Source YouTube playlist ID  
          migration.playlistId         // Use as name - your service will handle properly
        );
      } else {
        throw new Error(`Unsupported migration: ${migration.sourcePlatform} → ${migration.destinationPlatform}`);
      }

      // Calculate next run time
      const nextSyncAt = new Date(
        Date.now() + (migration.syncIntervalMinutes || 60) * 60 * 1000
      );

      // Update migration record with success
      await prisma.playlistMigration.update({
        where: { id: migration.id },
        data: {
          lastSyncAt: new Date(),
          nextSyncAt,
          lastSyncStatus: result?.success ? "SUCCESS" : "PARTIAL",
          lastSyncError: null,
          migrationCounter: migration.migrationCounter + 1,
          sourceTrackIds: result?.videoIds || result?.trackUris || migration.sourceTrackIds,
        },
      });

      console.log(`[ScheduledSync] Migration completed for playlist ${migration.playlistId}`);
      return result;
    } catch (error: any) {
      console.error(`[ScheduledSync] Migration failed for playlist ${migration.playlistId}:`, error);

      // Calculate next run time
      const nextSyncAt = new Date(
        Date.now() + (migration.syncIntervalMinutes || 60) * 60 * 1000
      );

      // Update migration record with failure
      await prisma.playlistMigration.update({
        where: { id: migration.id },
        data: {
          lastSyncAt: new Date(),
          nextSyncAt,
          lastSyncStatus: "FAIL",
          lastSyncError: error.message,
        },
      });

      throw error;
    }
  }

  // Run the cron job
  static async runCronJob() {
    console.log("[ScheduledSync] Running cron job...");
    
    try {
      const migrationsToRun = await this.getMigrationsToRun();
      console.log(`[ScheduledSync] Found ${migrationsToRun.length} migrations to execute`);

      for (const migration of migrationsToRun) {
        try {
          await this.executeMigration(migration);
        } catch (error) {
          console.error(`[ScheduledSync] Failed to execute migration ${migration.id}:`, error);
          // Continue with other migrations even if one fails
        }
      }
    } catch (error) {
      console.error("[ScheduledSync] Cron job failed:", error);
    }
  }

  // Get sync status for a user
  static async getUserSyncStatus(userId: string) {
    return await prisma.playlistMigration.findMany({
      where: {
        userId,
        autoSyncEnabled: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
  }

  // Update sync interval
  static async updateSyncInterval(
    userId: string,
    playlistId: string,
    sourcePlatform: string,
    destinationPlatform: string,
    newIntervalMinutes: number
  ) {
    const nextSyncAt = new Date(Date.now() + newIntervalMinutes * 60 * 1000);
    
    return await prisma.playlistMigration.updateMany({
      where: {
        userId,
        playlistId,
        sourcePlatform,
        destinationPlatform,
      },
      data: {
        syncIntervalMinutes: newIntervalMinutes,
        nextSyncAt,
      },
    });
  }

  // Get migration history for a specific playlist
  static async getMigrationHistory(
    userId: string,
    playlistId: string,
    sourcePlatform: string,
    destinationPlatform: string
  ) {
    return await prisma.playlistMigration.findFirst({
      where: {
        userId,
        playlistId,
        sourcePlatform,
        destinationPlatform,
      },
    });
  }

  // Pause auto sync (different from disable - can be resumed)
  static async pauseAutoSync(
    userId: string,
    playlistId: string,
    sourcePlatform: string,
    destinationPlatform: string
  ) {
    return await prisma.playlistMigration.updateMany({
      where: {
        userId,
        playlistId,
        sourcePlatform,
        destinationPlatform,
      },
      data: {
        autoSyncEnabled: false,
        // Keep nextSyncAt so it can be resumed
      },
    });
  }

  // Resume paused auto sync
  static async resumeAutoSync(
    userId: string,
    playlistId: string,
    sourcePlatform: string,
    destinationPlatform: string
  ) {
    const migration = await prisma.playlistMigration.findFirst({
      where: {
        userId,
        playlistId,
        sourcePlatform,
        destinationPlatform,
      },
    });

    if (!migration) {
      throw new Error("Migration not found");
    }

    const nextSyncAt = new Date(
      Date.now() + (migration.syncIntervalMinutes || 60) * 60 * 1000
    );

    return await prisma.playlistMigration.updateMany({
      where: {
        userId,
        playlistId,
        sourcePlatform,
        destinationPlatform,
      },
      data: {
        autoSyncEnabled: true,
        nextSyncAt,
      },
    });
  }
}
