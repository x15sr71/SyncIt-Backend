// src/backend/services/migration/migrationCronService.ts

import prisma from "../db/prisma";
import { migrateYoutubeToSpotifyService } from "../backend/services/migration/youtubeToSpotify";

interface MigrationData {
  id: string;
  userId: string;
  sourcePlaylistId: string;
  destinationPlaylistId: string;
  migrationCounter: number;
}

interface MigrationResult {
  success: boolean;
  migrationId: string;
  playlistId: string;
  userId: string;
  tracksAdded?: number;
  failedTracks?: number;
  executionTime: number;
  error?: string;
  result?: any;
}

interface UserMigrationResults {
  userId: string;
  totalMigrations: number;
  successful: number;
  failed: number;
  details: MigrationResult[];
}

interface CronJobResults {
  totalMigrations: number;
  successful: number;
  failed: number;
  details: MigrationResult[];
  message?: string;
}

/**
 * MigrationCronService
 * --------------------
 * Handles periodic playlist migration tasks (YouTube → Spotify).
 */
export class MigrationCronService {
  /**
   * Fetches all pending migrations that need to run.
   */
  static async getMigrationsToRun(): Promise<MigrationData[]> {
    return prisma.playlistMigration.findMany({
      where: {
        sourcePlaylistId: { not: null },
        destinationPlaylistId: { not: null },
        sourcePlatform: "YOUTUBE",
        destinationPlatform: "SPOTIFY",
      },
      select: {
        id: true,
        userId: true,
        sourcePlaylistId: true,
        destinationPlaylistId: true,
        migrationCounter: true,
      },
    });
  }

  /**
   * Executes a single playlist migration.
   */
  static async executeMigration(migration: MigrationData): Promise<MigrationResult> {
    const startTime = Date.now();
    const { id, userId, sourcePlaylistId, destinationPlaylistId } = migration;

    console.log(`[MigrationCron] ▶️ Starting migration for user ${userId}, playlist ${sourcePlaylistId}`);

    try {
      const playlistName = "Migrated Playlist";

      const result = await migrateYoutubeToSpotifyService(
        userId,
        sourcePlaylistId,
        playlistName,
        destinationPlaylistId
      );

      const executionTime = Date.now() - startTime;

      console.log(
        `[MigrationCron] ✅ Completed migration for playlist ${sourcePlaylistId}. ` +
        `Tracks added: ${result.numberOfTracksAdded}, Failed: ${result.failedTrackDetails?.length ?? 0}, ` +
        `Time: ${executionTime}ms`
      );

      return {
        success: true,
        migrationId: id,
        playlistId: sourcePlaylistId,
        userId,
        tracksAdded: result.numberOfTracksAdded,
        failedTracks: result.failedTrackDetails?.length ?? 0,
        executionTime,
        result,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(
        `[MigrationCron] ❌ Migration failed for user ${migration.userId}, playlist ${migration.sourcePlaylistId}: ${errorMessage}`
      );

      return {
        success: false,
        migrationId: id,
        playlistId: sourcePlaylistId,
        userId,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * Executes all migrations for a given user.
   */
  static async executeMigrationForUser(
    userId: string
  ): Promise<UserMigrationResults | { success: false; error: string; message: string }> {
    console.log(`[MigrationCron] 👤 Starting migrations for user ${userId}`);

    const migrations = await prisma.playlistMigration.findMany({
      where: {
        userId,
        sourcePlaylistId: { not: null },
        destinationPlaylistId: { not: null },
        sourcePlatform: "YOUTUBE",
        destinationPlatform: "SPOTIFY",
      },
      select: {
        id: true,
        userId: true,
        sourcePlaylistId: true,
        destinationPlaylistId: true,
        migrationCounter: true,
      },
    });

    if (migrations.length === 0) {
      console.warn(`[MigrationCron] ⚠️ No migrations found for user ${userId}`);
      return {
        success: false,
        error: "NO_MIGRATIONS_FOUND",
        message: "No migrations found for this user",
      };
    }

    const results: UserMigrationResults = {
      userId,
      totalMigrations: migrations.length,
      successful: 0,
      failed: 0,
      details: [],
    };

    for (const migration of migrations) {
      const migrationResult = await this.executeMigration(migration);
      migrationResult.success ? results.successful++ : results.failed++;
      results.details.push(migrationResult);
    }

    console.log(
      `[MigrationCron] ✅ Completed all migrations for user ${userId}. ` +
      `Successful: ${results.successful}, Failed: ${results.failed}`
    );

    return results;
  }

  /**
   * Executes migration for a specific playlist of a user.
   */
  static async executeMigrationForPlaylist(
    userId: string,
    playlistId: string
  ): Promise<MigrationResult | { success: false; error: string; message: string }> {
    console.log(`[MigrationCron] ▶️ Starting migration for user ${userId}, playlist ${playlistId}`);

    const migration = await prisma.playlistMigration.findFirst({
      where: {
        userId,
        sourcePlaylistId: playlistId,
        destinationPlaylistId: { not: null },
        sourcePlatform: "YOUTUBE",
        destinationPlatform: "SPOTIFY",
      },
      select: {
        id: true,
        userId: true,
        sourcePlaylistId: true,
        destinationPlaylistId: true,
        migrationCounter: true,
      },
    });

    if (!migration) {
      console.warn(`[MigrationCron] ⚠️ No migration found for user ${userId}, playlist ${playlistId}`);
      return {
        success: false,
        error: "MIGRATION_NOT_FOUND",
        message: "No migration found for this user and playlist combination",
      };
    }

    return this.executeMigration(migration);
  }

  /**
   * Runs the scheduled cron job for all eligible migrations.
   */
  static async runCronJob(): Promise<CronJobResults> {
    console.log(`[MigrationCron] 🕒 Running cron job at ${new Date().toISOString()}`);

    try {
      const migrations = await this.getMigrationsToRun();
      console.log(`[MigrationCron] Found ${migrations.length} migrations to execute.`);

      if (migrations.length === 0) {
        console.log("[MigrationCron] No migrations to process.");
        return {
          totalMigrations: 0,
          successful: 0,
          failed: 0,
          details: [],
          message: "No migrations to process",
        };
      }

      const results: CronJobResults = {
        totalMigrations: migrations.length,
        successful: 0,
        failed: 0,
        details: [],
      };

      // Sequential execution with delay (safe against API rate-limits)
      for (const migration of migrations) {
        const migrationResult = await this.executeMigration(migration);
        migrationResult.success ? results.successful++ : results.failed++;
        results.details.push(migrationResult);

        // Small delay between runs to prevent API throttling
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(
        `[MigrationCron] 🏁 Cron job completed. ` +
        `Successful: ${results.successful}, Failed: ${results.failed}`
      );

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MigrationCron] 💥 Cron job failed: ${errorMessage}`);
      throw error;
    }
  }
}
