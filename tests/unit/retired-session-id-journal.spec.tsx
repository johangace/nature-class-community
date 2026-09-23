import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE JOURNAL'S TWO RETIRED-ID CALL SITES (#543).
 *
 * The journal is where a teacher reads her own term back, and it reads it off
 * `session_completion` rows — the one place old session ids actually live for
 * years. It canonicalises in two places, and both were neuterable with the
 * whole suite green:
 *
 *   - the ENTRY: a completion's id is resolved to the session it names, so a
 *     lesson led before a rename reads as its title rather than as a dead
 *     slug, and its link opens.
 *   - STILL TO LEAD: the led set is canonicalised before the shelf is filtered
 *     by it, so a lesson she has already been out and done is not listed back
 *     to her as still ahead.
 *
 * Neither is a persistence path, which is why #543 scopes its five boundaries
 * elsewhere — but both are read by a teacher, and a journal that lists a
 * lesson she led last month as still to lead is the kind of wrong that makes
 * a teacher stop trusting the page.
 *
 * As in the other retired-id specs, nothing here hardcodes an id: the case is
 * driven off the first `RETIRED_SESSION_IDS` entry.
 */

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: { sessionCompletion: { findMany: vi.fn() } },
}));
vi.mock("@/lib/teacher", () => ({
  getActiveEnglishLocale: vi.fn().mockResolvedValue(null),
  getActiveClassLocation: vi.fn().mockResolvedValue(null),
  classMinutesOutside: vi.fn(),
  getActiveClass: vi.fn(),
  getTeacher: vi.fn(),
}));
// The place layer decides WHICH packs are on the shelf for this school; that
// is its own spec's business. Here it is the identity, so the shelf this page
// filters is the real catalogue shelf and the only thing under test is what
// the led set removes from it.
vi.mock("@/lib/place-context", () => ({
  activePlaceContext: vi.fn(),
  shelfForPlace: vi.fn((packs: unknown) => packs),
}));
vi.mock("@/app/AppNav", () => ({ AppNav: () => null }));
vi.mock("@/app/journal/EntryReflection", () => ({
  EntryReflection: () => null,
}));

import JournalPage from "@/app/journal/page";
import { prisma } from "@/lib/db";
import { findSession, RETIRED_SESSION_IDS, shelfPacksAllSeasons } from "@/lib/pack";
import { activePlaceContext } from "@/lib/place-context";
import {
  classMinutesOutside,
  getActiveClass,
  getTeacher,
} from "@/lib/teacher";

// The first rename whose lesson is still ON THE SHELF: "still to lead" only
// lists shelf lessons, and a rename target can be archived off the shelf
// while its old id keeps resolving (Leaves and their trees, 2026-09-06).
const onShelf = new Set(
  shelfPacksAllSeasons({ date: new Date(2026, 8, 17), lat: 51.5 })
    .flatMap((p) => p.sessions)
    .map((s) => s.id)
);
const firstRename = Object.entries(RETIRED_SESSION_IDS).find(([, id]) => onShelf.has(id));
if (!firstRename) throw new Error("RETIRED_SESSION_IDS names no shelf lesson: nothing to pin");
const [retiredId, currentId] = firstRename;
const found = findSession(currentId)!;
const renamed = found.session;
/** A neighbour on the same shelf, so the positive control names no id either. */
const neighbour = found.pack.sessions.find((s) => s.id !== currentId)!;

/** One completion row, of the shape the journal's own select returns. */
function completionRow(sessionId: string) {
  return {
    id: "completion-1",
    sessionId,
    endedAt: new Date("2026-03-04T13:30:00Z"),
    headcount: 24,
    mood: null,
    happenings: [],
    timing: null,
    moreOf: null,
    note: null,
  };
}

async function renderJournal(rows: ReturnType<typeof completionRow>[]) {
  vi.mocked(prisma.sessionCompletion.findMany).mockResolvedValue(rows as never);
  const markup = renderToStaticMarkup(await JournalPage());
  const [entries, ahead = ""] = markup.split("journal-ahead");
  return { markup, entries, ahead };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
  vi.mocked(getActiveClass).mockResolvedValue({
    id: "class-1",
    name: "Willow class",
    lat: 51.56,
    lng: -0.13,
  } as never);
  vi.mocked(classMinutesOutside).mockResolvedValue({
    minutes: 840,
    sessionsLed: 1,
  } as never);
  vi.mocked(activePlaceContext).mockResolvedValue({
    pack: { seasonOntology: { seasons: [] } },
  } as never);
});

describe("a journal holding a completion logged under a retired id", () => {
  it("reads the entry as the lesson it is now, not as a dead slug", async () => {
    const { entries } = await renderJournal([completionRow(retiredId)]);

    expect(entries).toContain(renamed.title);
    expect(entries).toContain(`/session?session=${currentId}`);
    // The old id survives nowhere on the page: not as the visible fallback
    // text a missing session leaves behind, and not in the link.
    expect(entries).not.toContain(retiredId);
  });

  it("does not list that lesson as still to lead", async () => {
    const { markup, ahead } = await renderJournal([completionRow(retiredId)]);

    // The section has to be there for the assertion below to mean anything —
    // an empty "still to lead" would pass it while proving nothing.
    expect(markup).toContain("Still to lead");
    expect(ahead).toContain("/session?session=");
    expect(ahead).not.toContain(`/session?session=${currentId}`);
  });

  it("still lists that same lesson for a class that has not led it", async () => {
    // The positive control, and the reason the assertion above is about the
    // canonicalisation rather than about the lesson being absent for some
    // other reason: led a NEIGHBOURING session instead, and the renamed one
    // is exactly where it should be — still to lead.
    const { ahead } = await renderJournal([completionRow(neighbour.id)]);

    expect(ahead).toContain(`/session?session=${currentId}`);
    expect(ahead).not.toContain(`/session?session=${neighbour.id}`);
  });
});
