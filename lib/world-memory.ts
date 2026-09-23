import "server-only";

import { prisma } from "@/lib/db";
import { groundsPlaceForClass, groundsPlaceSelect } from "@/lib/grounds";
import { localizeText, type Locale } from "@/lib/localization";
import { REACH_OPTIONS } from "@/app/start/vocab";
import { PHOTO_QUOTE, type WorldFactKind } from "@/lib/ai/world-extract-contract";

/**
 * WHAT WE REMEMBER ABOUT YOUR GROUNDS (#509).
 *
 * The intake shipped by #360 and #377 is invisible: a teacher tells the
 * assistant about a pond behind the sheds, confirms the candidate, and then
 * never sees that sentence again anywhere she reads before a lesson. This
 * composes the strip that quotes it back to her, with where it came from and
 * a way to retire it.
 *
 * WHAT IS IN THE STRIP, AND WHY NOT MORE. The rows are exactly the values
 * `setWorld` owns — `siteFeatures`, `siteNotes`, `reach`: zooms three and four
 * of the world (`lib/world.ts`), the ones that are "hers alone, and the only
 * source". Zoom two, the habitats a map suggested, is deliberately NOT here:
 * it is written by `setGrounds`, so a retire control beside it could not route
 * through the write path this ticket names, and a half-working control is
 * worse than none. It also could not be labelled honestly — the column cannot
 * say whether she accepted the map's suggestion or replaced it.
 *
 * PROVENANCE COMES FROM THE LEDGER, NOT FROM A GUESS. A live value is matched
 * against the confirmed `WorldFact` rows behind it; the newest confirmed row
 * for a `kind:value` pair supplies the provenance that row recorded. A value
 * with no ledger row behind it is one she tapped or typed in the grounds step
 * — still hers, so it is never labelled derived, it simply carries no quote.
 * Any provenance the ledger carries that is not one of hers renders as
 * derived, which is the case the schema comment on `WorldFact.provenance` was
 * written to leave room for.
 *
 * ONLY A SPOKEN FACT IS QUOTED, AND THAT IS NOT A STYLE RULE. `sourceText` is
 * her verbatim words ONLY for `teacher-stated`. A photographed fact stores the
 * sentinel `PHOTO_QUOTE` there instead, so quoting every row would have put
 * *You told us: "from your photograph"* on the page, and given every
 * photographed row the same useless accessible name.
 *
 * THE LEDGER IS READ ACROSS THE WHOLE GROUNDS, NOT ONE CLASS. `WorldFact` rows
 * carry a class, but `setWorld` mirrors the values themselves onto every class
 * sharing a `Grounds`. Reading one class's rows therefore showed Oak the pond
 * Willow's teacher had described, unquoted and labelled as a setup answer —
 * her own sentence, attributed to nobody. The ledger read follows the same
 * linkage the write does.
 *
 * NOTHING HERE IS A STALENESS CLOCK (#274/#275 later). A fact is shown until
 * she retires it; retiring is a write to the same column everything else
 * reads, plus a `retired` mark on the ledger rows behind it so a value she
 * later adds back by hand cannot inherit an old sentence's provenance.
 */

export type RememberedProvenance =
  | "teacher-stated"
  | "teacher-photographed"
  | "derived";

export interface RememberedFact {
  /** The column this value belongs to, and the one a retire writes back. */
  kind: WorldFactKind;
  /** The exact stored value, which is what identifies it to a retire. */
  value: string;
  /** The fact in plain words, for a row we are not quoting. */
  line: string;
  /** Her own words, verbatim — only ever for something she actually said. */
  quote: string | null;
  provenance: RememberedProvenance;
  /** Where it came from, in plain words, under the row. */
  source: string;
  /** "Not any more" for hers, "Not quite right" for one we worked out. */
  retireLabel: string;
}

/** One confirmed ledger row, reduced to what the strip reads from it. */
export interface WorldFactRecord {
  kind: string;
  value: string;
  sourceText: string;
  provenance: string;
  decidedAt: Date | null;
  extractedAt: Date;
}

/** The live world, as the columns `setWorld` writes hold it. */
export interface LiveWorld {
  siteFeatures: string[];
  siteNotes: string[];
  reach: string | null;
}

/** The status a retired ledger row carries. Never read back into the strip. */
export const RETIRED_STATUS = "retired";

const RETIRE_HERS = "Not any more";
const RETIRE_DERIVED = "Not quite right";

/** 12 August, or August 12. Her own calendar — this is not a timestamp. */
function saidOn(date: Date, locale: Locale): string {
  return date.toLocaleDateString(locale === "us" ? "en-US" : "en-GB", {
    day: "numeric",
    month: "long",
  });
}

function reachLabel(reach: string): string {
  return REACH_OPTIONS.find((option) => option.id === reach)?.label ?? reach;
}

function provenanceOf(record: WorldFactRecord | undefined): RememberedProvenance {
  if (!record) return "teacher-stated";
  if (record.provenance === "teacher-photographed") return "teacher-photographed";
  if (record.provenance === "teacher-stated") return "teacher-stated";
  // A provenance this build does not write. It is not hers, so it does not
  // get her register — see the file comment.
  return "derived";
}

function sourceLine(
  provenance: RememberedProvenance,
  record: WorldFactRecord | undefined,
  locale: Locale
): string {
  if (!record) return "Your answer, from setting up your grounds.";
  const when = saidOn(record.decidedAt ?? record.extractedAt, locale);
  if (provenance === "teacher-photographed") return `From your photograph, ${when}.`;
  if (provenance === "derived") return `Worked out for you, ${when}.`;
  return `Your words, ${when}.`;
}

/**
 * The newest confirmed row per `kind:value`. Newest wins because she can say
 * the same thing twice and the later sentence is the one she would recognise.
 */
function indexLedger(rows: WorldFactRecord[]): Map<string, WorldFactRecord> {
  const index = new Map<string, WorldFactRecord>();
  for (const row of rows) {
    const key = `${row.kind}:${row.value}`;
    const held = index.get(key);
    const when = (record: WorldFactRecord) => (record.decidedAt ?? record.extractedAt).getTime();
    if (!held || when(row) > when(held)) index.set(key, row);
  }
  return index;
}

function factFor(
  kind: WorldFactKind,
  value: string,
  line: string,
  index: Map<string, WorldFactRecord>,
  locale: Locale
): RememberedFact {
  const record = index.get(`${kind}:${value}`);
  const provenance = provenanceOf(record);
  /**
   * Quoted only when the ledger holds something she SAID. `PHOTO_QUOTE` is
   * checked as well as the provenance, because it is the sentinel that put the
   * bug on the page and a row mislabelled `teacher-stated` would carry it just
   * the same.
   */
  const spoken =
    provenance === "teacher-stated" && record && record.sourceText !== PHOTO_QUOTE
      ? record.sourceText
      : null;
  return {
    kind,
    value,
    line: localizeText(line, locale),
    quote: spoken,
    provenance,
    source: localizeText(sourceLine(provenance, record, locale), locale),
    retireLabel: provenance === "derived" ? RETIRE_DERIVED : RETIRE_HERS,
  };
}

/**
 * Compose the strip from a live world and the confirmed ledger behind it.
 *
 * Pure, and the whole rule lives here: an empty world composes to an empty
 * array, which is what lets the surface render nothing rather than an empty
 * frame. Her own words are never localized — swapping a word inside her
 * sentence would be us editing it.
 */
export function composeRememberedFacts(
  world: LiveWorld,
  ledger: WorldFactRecord[],
  locale: Locale = "uk"
): RememberedFact[] {
  const index = indexLedger(ledger);
  const facts: RememberedFact[] = [];

  for (const note of world.siteNotes) {
    if (!note.trim()) continue;
    // A note IS her own words, so its line stays exactly as she wrote it.
    facts.push({ ...factFor("note", note, note, index, locale), line: note });
  }
  for (const feature of world.siteFeatures) {
    if (!feature.trim()) continue;
    facts.push(factFor("feature", feature, `In your grounds: ${feature}.`, index, locale));
  }
  if (world.reach && world.reach.trim()) {
    facts.push(
      factFor(
        "reach",
        world.reach,
        `How far you can get: ${reachLabel(world.reach)}.`,
        index,
        locale
      )
    );
  }

  return facts;
}

/**
 * Every class whose world this one shares, the teacher's own only.
 *
 * `setWorld` writes the values to all of them, so the ledger behind those
 * values has to be read from all of them or a shared fact loses its sentence.
 */
export async function classIdsSharingGrounds(
  teacherId: string,
  classId: string,
  groundsId: string | null
): Promise<string[]> {
  if (!groundsId) return [classId];
  const linked = await prisma.class.findMany({
    where: { groundsId, teacherId },
    select: { id: true },
  });
  const ids = linked.map((row) => row.id);
  return ids.includes(classId) ? ids : [...ids, classId];
}

/**
 * Read one class's remembered facts. Ownership-scoped, and fail-soft: a read
 * that throws costs the strip, never the lesson she came to prepare.
 */
export async function rememberedFactsForClass(
  teacherId: string,
  classId: string,
  locale: Locale = "uk"
): Promise<RememberedFact[]> {
  try {
    const row = await prisma.class.findFirst({
      where: { id: classId, teacherId },
      select: {
        school: true,
        lat: true,
        lng: true,
        climate: true,
        grounds: true,
        groundsId: true,
        siteFeatures: true,
        siteNotes: true,
        reach: true,
        placeRead: true,
        placeReadAt: true,
        groundsProfile: { select: groundsPlaceSelect },
      },
    });
    if (!row) return [];
    const place = groundsPlaceForClass(row);

    const ledger = await prisma.worldFact.findMany({
      where: {
        classId: { in: await classIdsSharingGrounds(teacherId, classId, row.groundsId) },
        status: "confirmed",
      },
      select: {
        kind: true,
        value: true,
        sourceText: true,
        provenance: true,
        decidedAt: true,
        extractedAt: true,
      },
    });

    return composeRememberedFacts(
      {
        siteFeatures: place.siteFeatures,
        siteNotes: place.siteNotes,
        reach: place.reach,
      },
      ledger,
      locale
    );
  } catch {
    return [];
  }
}
