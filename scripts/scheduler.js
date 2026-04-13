/**
 * INFRASITY SALES DASHBOARD — SCHEDULER
 * Runs sync.js at 4:00 AM IST (10:30 PM UTC) every day
 * 
 * Start with: node scripts/scheduler.js
 * Or use PM2:  pm2 start scripts/scheduler.js --name infrasity-sync
 */

const cron = require("node-cron");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const LOG_PATH = path.join(__dirname, "../logs/scheduler.log");

function log(msg) {
  const ts = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });
  const line = `[${ts} IST] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + "\n");
}

// 4:00 AM IST = 22:30 UTC (UTC+5:30)
// Cron: second minute hour day month weekday
// "30 22 * * *" = every day at 22:30 UTC = 04:00 IST
const SCHEDULE = "30 22 * * *";

log(`Scheduler started. Next sync at 4:00 AM IST daily.`);
log(`Cron pattern: ${SCHEDULE} (UTC)`);

cron.schedule(SCHEDULE, () => {
  log("═══════════════════════════════════════");
  log("Scheduled sync triggered — 4:00 AM IST");
  log("═══════════════════════════════════════");
  
  try {
    const syncPath = path.join(__dirname, "sync.js");
    execSync(`node ${syncPath}`, {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    log("Scheduled sync completed successfully.");
  } catch (err) {
    log(`Scheduled sync FAILED: ${err.message}`);
  }
}, {
  timezone: "UTC",
});

// Also run once immediately on startup (optional — comment out if not wanted)
log("Running immediate sync on startup...");
try {
  const syncPath = path.join(__dirname, "sync.js");
  execSync(`node ${syncPath}`, {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  log("Startup sync complete.");
} catch (err) {
  log(`Startup sync failed: ${err.message}`);
}
