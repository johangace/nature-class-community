#!/usr/bin/env node
/**
 * What did the passkey actually do?
 *
 * WHY THIS EXISTS
 *
 * The passkey has been reported broken three times — #45 (the wrong sensor
 * named, the offer that would not go away), the domain move that silently
 * invalidated every enrolled credential (#568), and Johan again on
 * 2026-08-28: still "not reliable". Every one of those fixes was aimed at a
 * symptom described from memory, because a WebAuthn failure lands in a
 * console on a device nobody else is holding.
 *
 * #650 records each ended ceremony instead. This reads the record and prints
 * the only three things that can settle the question:
 *
 *   THE RATIO.   Failures without a denominator cannot tell a broken path
 *                from an unused one. Successes are counted too.
 *   THE CODES.   The library names each way a ceremony can end. A pile of
 *                ERROR_INVALID_RP_ID is a domain problem; a pile of
 *                NotAllowed cancels is a copy problem; a pile of
 *                unavailable is a device problem. They want opposite fixes.
 *   THE DEVICE.  "Every failure is an iPad on Safari" and "every failure is
 *                a desktop Chrome with no sensor" are different findings.
 *
 * Usage: node scripts/passkey-report.mjs [--days 30]
 * Reads DATABASE_URL. Prints nothing but counts; no row identifies anyone.
 */
import { PrismaClient } from "@prisma/client";

const days = Number(
  process.argv.includes("--days")
    ? process.argv[process.argv.indexOf("--days") + 1]
    : 30
);

if (!Number.isFinite(days) || days <= 0) {
  console.error("--days must be a positive number of days");
  process.exit(1);
}

const prisma = new PrismaClient();
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const rows = await prisma.passkeyCeremony.findMany({
  where: { createdAt: { gte: since } },
  orderBy: { createdAt: "asc" },
});

if (rows.length === 0) {
  console.log(
    `No passkey ceremonies recorded in the last ${days} days.\n` +
      "That is itself a reading: either nobody is being offered one, or the " +
      "reporting is not reaching the server. Check that /api/passkey-report " +
      "answers 204 before concluding the first."
  );
  await prisma.$disconnect();
  process.exit(0);
}

const tally = (keyOf) => {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const print = (title, entries, total = rows.length) => {
  console.log(`\n${title}`);
  if (entries.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const [key, count] of entries) {
    const share = Math.round((count / total) * 100);
    console.log(`  ${String(count).padStart(5)}  ${String(share).padStart(3)}%  ${key}`);
  }
};

const succeeded = rows.filter((r) => r.outcome === "ok").length;
const attempted = rows.filter((r) => r.outcome !== "already").length;

console.log(
  `${rows.length} passkey ceremon${rows.length === 1 ? "y" : "ies"} in the last ${days} days ` +
    `(${rows[0].createdAt.toISOString().slice(0, 10)} to ` +
    `${rows[rows.length - 1].createdAt.toISOString().slice(0, 10)})`
);
console.log(
  `\nTHE RATIO: ${succeeded} of ${attempted} attempts ended in a signed-in ` +
    `teacher or a saved passkey` +
    (attempted > 0 ? ` (${Math.round((succeeded / attempted) * 100)}%).` : ".")
);

print("BY ENDING", tally((r) => r.outcome));
print("BY SURFACE AND ACT", tally((r) => `${r.surface} · ${r.act}`));
print(
  "FAILURE CODES (the library's own words)",
  tally((r) => (r.outcome === "failed" || r.outcome === "unavailable" ? r.code ?? "no code" : null)),
  rows.filter((r) => r.outcome === "failed" || r.outcome === "unavailable").length || 1
);
print("BY DEVICE", tally((r) => `${r.platform} · ${r.browser}`));
print(
  "DEVICES THAT SAID THEY COULD SAVE ONE",
  tally((r) => (r.canSave === null ? null : r.canSave ? "yes" : "no"))
);

console.log(
  "\nRead it against the question that produced it: keep the path, stop\n" +
    "offering it, or retire it. Sessions last 30 days, so this path guards a\n" +
    "monthly event, not a daily one."
);

await prisma.$disconnect();
