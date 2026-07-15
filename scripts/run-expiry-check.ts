/**
 * Run: npm run expiry-check
 * Schedule this via Vercel Cron (vercel.json) or a Railway/Render cron task
 * on a daily cadence per spec §4.4.
 */
import { runExpiryCheck } from "@/lib/ingestion/expiry";
import { prisma } from "@/lib/prisma";

runExpiryCheck()
  .then((result) => {
    console.log("Expiry check complete:", result);
  })
  .catch((err) => {
    console.error("Expiry check failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
