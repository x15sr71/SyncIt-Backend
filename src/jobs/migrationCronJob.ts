// src/jobs/migrationCronJob.ts
import * as cron from "node-cron";
import { MigrationCronService } from "../cron/migrationCronService";

export class MigrationCronJob {
  private static job: cron.ScheduledTask | null = null;

  // Start the cron job (runs every 10 minutes)
  static start() {
    if (this.job) {
      console.log("[MigrationCronJob] ⏳ Job already running");
      return;
    }

    // Define the cron schedule
    const schedule = "*/10 * * * *"; // Every 10 minutes
    const timezone = "UTC";

    this.job = cron.schedule(
      schedule,
      async () => {
        console.log("[MigrationCronJob] 🚀 Executing scheduled migration job");
        try {
          await MigrationCronService.runCronJob();
          console.log("[MigrationCronJob] Migration cron completed successfully");
        } catch (error) {
          console.error("[MigrationCronJob] Cron execution failed:", error);
        }
      },
      { timezone }
    );

    console.log(`[MigrationCronJob] Migration cron job started (${schedule}, TZ: ${timezone})`);

    // Optionally run immediately on startup (after short delay)
    setTimeout(async () => {
      console.log("[MigrationCronJob] Running initial migration on startup...");
      try {
        await MigrationCronService.runCronJob();
        console.log("[MigrationCronJob] Initial migration completed successfully");
      } catch (error) {
        console.error("[MigrationCronJob] Initial migration failed:", error);
      }
    }, 5000);

    // Graceful shutdown listener
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());
  }

  // Stop the cron job
  static stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log("[MigrationCronJob] Migration cron job stopped gracefully");
    } else {
      console.log("[MigrationCronJob] No active cron job to stop");
    }
  }

  // Check if job is running
  static isRunning(): boolean {
    return this.job !== null;
  }

  // Get cron job status
  static getStatus() {
    return {
      isRunning: this.isRunning(),
      schedule: "*/10 * * * *", // Every 10 minutes
      timezone: "UTC",
    };
  }
}
