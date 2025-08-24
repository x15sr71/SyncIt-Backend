// jobs/syncCronJob.ts

import * as cron from "node-cron";
import { ScheduledSyncService } from "../backend/services/scheduleSync/scheduledSyncService";

export class SyncCronJob {
  private static job: cron.ScheduledTask | null = null;

  // Start the cron job (runs every 10 minutes to check for due syncs)
  static start() {
    if (this.job) {
      console.log("[CronJob] Sync job is already running");
      return;
    }

    // Run every 10 minutes to check for due syncs
    this.job = cron.schedule("*/10 * * * *", async () => {
      console.log("[CronJob] Checking for scheduled migrations");
      await ScheduledSyncService.runCronJob();
    });

    console.log("[CronJob] Scheduled sync cron job started (checks every 10 minutes)");
  }

  // Stop the cron job
  static stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log("[CronJob] Scheduled sync cron job stopped");
    }
  }

  // Check if job is running
  static isRunning(): boolean {
    return this.job !== null;
  }

  // Manually trigger a cron job run (for testing)
  static async runNow() {
    console.log("[CronJob] Manually triggering cron job");
    await ScheduledSyncService.runCronJob();
  }
}
