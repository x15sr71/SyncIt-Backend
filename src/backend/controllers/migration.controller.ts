// src/cron/migrationCronService.ts
import prisma from "../../db";
import { migrateYoutubeToSpotifyService } from "../../backend/services/migration/youtubeToSpotify";

export class MigrationCronService {
  // Get all migrations that need to run
  static async getMigrationsToRun() {
    return await prisma.playlistMigration.findMany({
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

  // Execute a single migration
  static async executeMigration(migration: any) {
    const startTime = Date.now();

    try {
      console.log(`[MigrationCron] Starting migration for playlist ${migration.playlistId}, user ${migration.userId}`);

      const playlistName = "Migrated Playlist";
      
      const result = await migrateYoutubeToSpotifyService(
        migration.userId,
        migration.playlistId,
        playlistName,
        migration.destinationPlaylistId
      );

      const executionTime = Date.now() - startTime;

      console.log(`[MigrationCron] Migration completed for playlist ${migration.playlistId}: added ${result.numberOfTracksAdded} tracks in ${executionTime}ms`);
      
      return {
        success: true,
        migrationId: migration.id,
        playlistId: migration.playlistId,
        userId: migration.userId,
        tracksAdded: result.numberOfTracksAdded,
        failedTracks: result.failedTrackDetails.length,
        executionTime,
        result
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      
      console.error(`[MigrationCron] Migration failed for playlist ${migration.playlistId}, user ${migration.userId}:`, error);
      
      return {
        success: false,
        migrationId: migration.id,
        playlistId: migration.playlistId,
        userId: migration.userId,
        error: error.message,
        executionTime
      };
    }
  }

  // Execute migration for specific user
  static async executeMigrationForUser(userId: string) {
    console.log(`[MigrationCron] Starting migrations for user ${userId}`);

    const migrations = await prisma.playlistMigration.findMany({
      where: {
        userId: userId,
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
      return {
        success: false,
        error: "NO_MIGRATIONS_FOUND",
        message: "No migrations found for this user"
      };
    }

    const results = {
      success: true, // ✅ Added success property
      userId,
      totalMigrations: migrations.length,
      successful: 0,
      failed: 0,
      details: []
    };

    for (const migration of migrations) {
      const migrationResult = await this.executeMigration(migration);
      
      if (migrationResult.success) {
        results.successful++;
      } else {
        results.failed++;
      }
      
      results.details.push(migrationResult);
    }

    console.log(`[MigrationCron] User ${userId} migrations completed. Successful: ${results.successful}, Failed: ${results.failed}`);
    return results;
  }

  // Execute migration for specific playlist
  static async executeMigrationForPlaylist(userId: string, playlistId: string) {
    console.log(`[MigrationCron] Starting migration for user ${userId}, playlist ${playlistId}`);

    const migration = await prisma.playlistMigration.findFirst({
      where: {
        userId: userId,
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
      return {
        success: false,
        error: "MIGRATION_NOT_FOUND",
        message: "No migration found for this user and playlist combination"
      };
    }

    return await this.executeMigration(migration);
  }

  // Run the main cron job
  static async runCronJob() {
    console.log(`[MigrationCron] Running cron job at ${new Date().toISOString()}`);
    
    try {
      const migrations = await this.getMigrationsToRun();
      console.log(`[MigrationCron] Found ${migrations.length} migrations to execute`);

      if (migrations.length === 0) {
        console.log("[MigrationCron] No migrations to process");
        return {
          success: true, // ✅ Added success property
          totalMigrations: 0,
          successful: 0,
          failed: 0,
          details: [],
          message: "No migrations to process"
        };
      }

      const results = {
        success: true, // ✅ Added success property
        totalMigrations: migrations.length,
        successful: 0,
        failed: 0,
        details: []
      };

      for (const migration of migrations) {
        const migrationResult = await this.executeMigration(migration);
        
        if (migrationResult.success) {
          results.successful++;
        } else {
          results.failed++;
        }
        
        results.details.push(migrationResult);
        
        // Add small delay between migrations to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`[MigrationCron] Cron job completed. Successful: ${results.successful}, Failed: ${results.failed}`);
      return results;
    } catch (error: any) {
      console.error("[MigrationCron] Cron job failed:", error);
      return {
        success: false,
        error: "CRON_JOB_FAILED",
        message: error.message || "Cron job execution failed"
      };
    }
  }
}
