// src/jobs/migrationCronJob.ts
import * as cron from "node-cron";
import { MigrationCronService } from "../cron/migrationCronService";


export class MigrationCronJob {
  private static job: cron.ScheduledTask | null = null;


  // Start the cron job (runs every 10 minutes)
  static start() {
    if (this.job) {
      console.log("[MigrationCronJob] Job is already running");
      return;
    } 


    // Run every 10 minutes
    this.job = cron.schedule("*/10 * * * *", async () => {
      console.log("[MigrationCronJob] Executing scheduled migration job");
      try {
        await MigrationCronService.runCronJob();
      } catch (error) {
        console.error("[MigrationCronJob] Cron execution failed:", error);
      }
    }, {
      timezone: "UTC"
    });


    console.log("[MigrationCronJob] Migration cron job started (every 10 minutes)");
    
    // Optionally run immediately on startup
    setTimeout(async () => {
      console.log("[MigrationCronJob] Running initial migration on startup");
      try {
        await MigrationCronService.runCronJob();
      } catch (error) {
        console.error("[MigrationCronJob] Initial migration failed:", error);
      }
    }, 5000); // Wait 5 seconds after startup
  }


  // Stop the cron job
  static stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log("[MigrationCronJob] Migration cron job stopped");
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
      timezone: "UTC"
    };
  }
}
