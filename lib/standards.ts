import type { SessionStandard, StandardsSystem } from "@/schema/pack";

/**
 * Grouping a session's `standards` array into what a reader actually sees:
 * one heading per (system, code) pair, however many objectives share it.
 *
 * WHY THIS IS ITS OWN FILE, NOT INLINED TWICE (#464).
 *
 * The primer and the printable one-pager are two renderers of the same
 * `Session.standards` data (`app/session/primer/PrimerPage.tsx` and
 * `app/print/page.tsx`). They shipped with the same reduce written out in
 * both, which is the drift this codebase's one-component rule exists to
 * prevent — the runner's spoken lines live in one place for exactly this
 * reason, and a citation is a stronger case than a spoken line: the two
 * surfaces are the screen a teacher reads and the paper she hands upwards,
 * and they must not disagree about what a session covers.
 *
 * England commonly publishes several objectives under one statutory
 * subheading (see "Minibeast hunting" in `packs/summer.json`, which carries
 * two under `Year 2 · Living things and their habitats`), so two objectives
 * sharing a code print as one heading with two quoted lines beneath it, never
 * as the same heading printed twice.
 *
 * Authored order is preserved. The order objectives appear in a pack is a
 * content decision, and re-sorting them here would take it silently.
 */
export interface StandardsCitation {
  system: StandardsSystem;
  code: string;
  /** The published objective(s) this session meets, verbatim, in authored order. */
  texts: string[];
  /**
   * The half-term slot, when one is ever authored. Absent everywhere today:
   * #565 found no citable national placement, because Oak's own ordering and
   * a real school's curriculum map disagree on where the same unit sits.
   */
  slot?: string;
}

export function groupStandardsCitations(
  standards: readonly SessionStandard[]
): StandardsCitation[] {
  const groups: StandardsCitation[] = [];
  for (const standard of standards) {
    const existing = groups.find(
      (g) => g.system === standard.system && g.code === standard.code
    );
    if (existing) {
      existing.texts.push(standard.text);
      existing.slot = existing.slot ?? standard.slot;
      continue;
    }
    groups.push({
      system: standard.system,
      code: standard.code,
      texts: [standard.text],
      slot: standard.slot,
    });
  }
  return groups;
}
