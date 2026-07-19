/**
 * Insight alerts runner — run weekly on a schedule (GitHub Actions, like the
 * other crons; never a Vercel function, which times out at 10s).
 *
 * Run: npx tsx scripts/run-insight-alerts.ts [--dry-run] [--limit=N]
 *
 * For EVERY profile: compute insights and store a compact snapshot (the diff
 * raw material accrues for everyone, so the coach page can show "what moved"
 * even to people who never opted into email). For profiles that opted in
 * (insightAlerts=true) AND whose diff found real movement: send the email.
 * Quiet markets send nothing. Snapshots are pruned to the last 8 per profile.
 *
 * --dry-run prints exactly what would be sent without calling Resend.
 */
import { prisma } from "@/lib/prisma";
import { getProfileInsights } from "@/lib/matching/insights";
import { sendEmail } from "@/lib/alerts/send";
import { snapshotFrom, diffInsights, renderInsightAlertEmail, type InsightSnapshotPayload } from "@/lib/alerts/insights";

const KEEP_SNAPSHOTS = 8;
// Don't snapshot again if the last capture is fresher than this — an
// accidental re-run of the workflow shouldn't produce a zero-movement diff
// pair or double-send anything.
const MIN_GAP_HOURS = 24 * 5;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  if (!dryRun && !process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set — refusing to run without --dry-run.");
    process.exit(1);
  }

  const profiles = await prisma.profile.findMany({
    select: { id: true, userId: true, fullName: true, insightAlerts: true, insightUnsubToken: true },
    take: limit,
  });
  console.log(`${profiles.length} profile(s)${dryRun ? " — DRY RUN, nothing will be sent" : ""}\n`);

  let snapped = 0, skippedFresh = 0, moved = 0, sent = 0, failed = 0;

  for (const p of profiles) {
    try {
      const last = await prisma.insightSnapshot.findFirst({
        where: { profileId: p.id },
        orderBy: { capturedAt: "desc" },
      });
      if (last && Date.now() - last.capturedAt.getTime() < MIN_GAP_HOURS * 3600_000) {
        skippedFresh++;
        continue;
      }

      const ins = await getProfileInsights(p.id);
      if (!ins) continue;
      const cur = snapshotFrom(ins);

      if (!dryRun) {
        await prisma.insightSnapshot.create({ data: { profileId: p.id, payload: cur as object } });
        // Prune beyond the last KEEP_SNAPSHOTS.
        const stale = await prisma.insightSnapshot.findMany({
          where: { profileId: p.id },
          orderBy: { capturedAt: "desc" },
          skip: KEEP_SNAPSHOTS,
          select: { id: true },
        });
        if (stale.length) await prisma.insightSnapshot.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
      }
      snapped++;

      if (!last) continue; // first capture — nothing to diff yet
      const changes = diffInsights(last.payload as unknown as InsightSnapshotPayload, cur);
      if (!changes.length) continue;
      moved++;
      console.log(`  ${p.fullName ?? p.id}: ${changes.length} change(s) — ${changes.map((c) => c.kind).join(", ")}`);

      if (!p.insightAlerts) continue; // movement noted (coach page shows it) but no email without opt-in

      const auth = await prisma.$queryRawUnsafe<{ email: string | null }[]>(
        `SELECT email FROM auth.users WHERE id = $1::uuid`, p.userId
      );
      const email = auth[0]?.email;
      if (!email) {
        console.log(`    opted in but no auth email found — skipping send`);
        continue;
      }

      const msg = renderInsightAlertEmail({ fieldLabel: cur.fieldLabel, changes, unsubToken: p.insightUnsubToken });
      if (dryRun) {
        console.log(`    would send to ${email.replace(/(.).*(@.*)/, "$1***$2")}: "${msg.subject}"`);
        for (const c of changes) console.log(`      · ${c.headline}`);
      } else {
        await sendEmail({ to: email, subject: msg.subject, html: msg.html, listUnsubscribeUrl: msg.unsubUrl });
        sent++;
      }
    } catch (e) {
      failed++;
      console.error(`  FAILED ${p.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\nsnapshotted ${snapped}, fresh-skipped ${skippedFresh}, moved ${moved}, emailed ${sent}, failed ${failed}`);
  if (failed > 0) process.exit(1);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
