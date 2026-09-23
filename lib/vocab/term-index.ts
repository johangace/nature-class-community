import { loadAllPacks, shelfPacksAllSeasons } from "@/lib/pack";
import { fold, variants } from "@/lib/vocab/normalise";

/**
 * THE TERM INDEX: our sessions, keyed by the words they actually teach (#563).
 *
 * The join key is a teacher's own key-vocabulary list. Hers is one column of
 * her unit plan — "coprolite", "detritivore", "micro-habitat", "impermeable" —
 * and it is largely not her school's invention: it is downstream of the
 * statutory programme of study every English primary teaches. Ours is
 * `primer.glossary[].term`, authored session by session for #350's live
 * glossary. This file turns the second into something the first can be held
 * against.
 *
 * ── WHAT IS IN THE INDEX, AND NOTHING ELSE ────────────────────────────────
 *
 * Only words this repo already authored, read fresh off `packs/*.json` on
 * every call like every other pack reader here. No school's curriculum map,
 * no unit names, no vocabulary list from anybody's planning file, and no
 * synonym table: asserting that two different words mean the same thing needs
 * an authority to cite, and there is none (that is why #622 was closed rather
 * than merged). The index recognises the shared words underneath a hundred
 * schools' documents; it does not hold a copy of any of them.
 *
 * ── WHAT THE INDEX CANNOT SEE, AND SAYS SO ────────────────────────────────
 *
 * A matcher over incomplete glossaries measures our own gaps, so the gap is
 * part of the output rather than a footnote: `coverage` reports how many
 * sessions carry words at all, and therefore what fraction of the shelf a
 * teacher's list can even be matched against. A wordless session is
 * unreachable by any word she types. That number is the finding, not the
 * embarrassment.
 */

/**
 * The minimum of a session this index reads: an id, a title, and the glossary
 * it authored. A real `Session` satisfies it and carries far more.
 *
 * Structural rather than `Session`, for the same reason `register-lint.d.mts`
 * declares its own `LintSession`: it lets a spec build a small, obviously
 * synthetic catalogue and assert on the matcher, instead of casting a
 * half-built object at the pack schema and asserting on the cast.
 */
export interface IndexableSession {
  id: string;
  title: string;
  primer?: { glossary?: readonly { term: string }[] | undefined } | undefined;
}

export interface IndexablePack {
  id: string;
  title: string;
  sessions: readonly IndexableSession[];
}

/** Where an authored term lives. Enough to name the session back to a teacher. */
export interface SessionRef {
  packId: string;
  packTitle: string;
  sessionId: string;
  sessionTitle: string;
  /** Is this session on the shelf a teacher can actually reach today? */
  onShelf: boolean;
}

/** One session's authored spelling of a term, and the session it is authored in. */
export interface TermSource {
  /** OUR authored word, verbatim from the pack. */
  term: string;
  session: SessionRef;
}

/** One distinct word in the index, with every session that teaches it. */
export interface IndexedTerm {
  /** The folded form — the comparison key, never shown to anybody. */
  folded: string;
  /** The first authored spelling, for display. */
  term: string;
  sources: TermSource[];
}

/** What the shelf can and cannot be matched against. The honest denominator. */
export interface VocabCoverage {
  packs: number;
  sessions: number;
  sessionsWithTerms: number;
  sessionsWithoutTerms: number;
  /** Named, so the gap is a work list rather than a percentage. */
  wordlessSessionIds: string[];
  /** Authored glossary entries, counting a word once per session. */
  termEntries: number;
  /** Distinct words after folding — the size of the join key. */
  distinctTerms: number;
  shelfSessions: number;
  shelfSessionsWithTerms: number;
  shelfWordlessSessionIds: string[];
}

export interface VocabIndex {
  terms: IndexedTerm[];
  /** Every folded variant of every term → the terms carrying it. */
  byVariant: Map<string, IndexedTerm[]>;
  sessions: SessionRef[];
  coverage: VocabCoverage;
}

/** The glossary a session authored, or an empty list. Never invented. */
function glossaryTerms(session: IndexableSession): string[] {
  return (session.primer?.glossary ?? []).map((entry) => entry.term);
}

/**
 * Build an index over the packs given. Pure: hand it packs and it reads
 * nothing else, which is what lets a spec build a small obviously-synthetic
 * catalogue and assert on the matcher rather than on the shelf.
 */
export function buildVocabIndex(
  packs: readonly IndexablePack[],
  shelfSessionIds: ReadonlySet<string> = new Set()
): VocabIndex {
  const byFolded = new Map<string, IndexedTerm>();
  const sessions: SessionRef[] = [];
  const wordless: string[] = [];
  const shelfWordless: string[] = [];
  let entries = 0;
  let withTerms = 0;
  let shelfSessions = 0;
  let shelfWithTerms = 0;

  for (const pack of packs) {
    for (const session of pack.sessions) {
      const ref: SessionRef = {
        packId: pack.id,
        packTitle: pack.title,
        sessionId: session.id,
        sessionTitle: session.title,
        onShelf: shelfSessionIds.has(session.id),
      };
      sessions.push(ref);

      const terms = glossaryTerms(session);
      const carries = terms.length > 0;
      if (carries) withTerms += 1;
      else wordless.push(session.id);
      if (ref.onShelf) {
        shelfSessions += 1;
        if (carries) shelfWithTerms += 1;
        else shelfWordless.push(session.id);
      }

      for (const term of terms) {
        const folded = fold(term);
        if (folded === "") continue;
        entries += 1;
        const existing = byFolded.get(folded);
        if (existing) existing.sources.push({ term, session: ref });
        else byFolded.set(folded, { folded, term, sources: [{ term, session: ref }] });
      }
    }
  }

  const terms = [...byFolded.values()].sort((a, b) => a.folded.localeCompare(b.folded));

  const byVariant = new Map<string, IndexedTerm[]>();
  for (const term of terms) {
    for (const key of variants(term.term)) {
      const bucket = byVariant.get(key);
      if (bucket) {
        if (!bucket.includes(term)) bucket.push(term);
      } else {
        byVariant.set(key, [term]);
      }
    }
  }

  return {
    terms,
    byVariant,
    sessions,
    coverage: {
      packs: packs.length,
      sessions: sessions.length,
      sessionsWithTerms: withTerms,
      sessionsWithoutTerms: sessions.length - withTerms,
      wordlessSessionIds: wordless,
      termEntries: entries,
      distinctTerms: terms.length,
      shelfSessions,
      shelfSessionsWithTerms: shelfWithTerms,
      shelfWordlessSessionIds: shelfWordless,
    },
  };
}

/**
 * The index over this repo's own catalogue: every pack in `packOrder`, with
 * the shelf (`shelfPacksAllSeasons`) marked so a match can say whether the
 * session it found is on the shelf at all or still off it.
 *
 * The whole shelf, every season: `shelfPacksAllSeasons` is only the open season since
 * 2026-09-06, and "is this word one a teacher will meet" is a question about
 * the year, not about this month, so the index is the same whenever it is
 * built.
 */
export function loadVocabIndex(): VocabIndex {
  const shelf = new Set<string>();
  for (const pack of shelfPacksAllSeasons()) {
    for (const session of pack.sessions) shelf.add(session.id);
  }
  return buildVocabIndex(loadAllPacks(), shelf);
}
