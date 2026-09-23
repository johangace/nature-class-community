import type { CastMember } from "@/lib/cast/member";
import { castSlug } from "@/lib/cast/member";

/**
 * THE DETERMINISTIC ENTITY LINKER (nc#219, nc#223).
 *
 * Species names inside a lesson's own sentences become tappable entities —
 * ruled when the just-for-you / look-around lines were judged weak precisely
 * because the creatures they name were dead text (R9). The linker is
 * deterministic and lives at the render seam: it never invents an entity, it
 * only recognises, in the authored words, the species the lesson already
 * carries. No model call, no fuzzy match, no runtime surprise — the same
 * sentence links the same way every time.
 *
 * Matching is by common name, case-insensitive, on word boundaries, longest
 * name first (so "garden spider" wins over "spider" when both are in the
 * cast), tolerating a plural "s". Scientific names are deliberately not
 * matched: a lesson that says "Vanessa atalanta" is quoting a label, and the
 * label already sits beside the photograph.
 */

export type EntitySegment =
  | { kind: "text"; text: string }
  | { kind: "entity"; text: string; slug: string; commonName: string };

type Linkable = Pick<CastMember, "commonName" | "scientificName">;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split one authored string into plain text and recognised species entities. */
export function linkEntities(text: string, members: Linkable[]): EntitySegment[] {
  const names = members
    .map((member) => ({ member, name: member.commonName.trim() }))
    .filter((entry) => entry.name.length >= 3)
    // Longest first, so multi-word names never lose to their own last word.
    .sort((a, b) => b.name.length - a.name.length);

  if (names.length === 0 || text.length === 0) {
    return text.length ? [{ kind: "text", text }] : [];
  }

  const pattern = new RegExp(
    `\\b(${names.map((entry) => escapeRegExp(entry.name)).join("|")})(?:e?s)?\\b`,
    "gi"
  );

  const segments: EntitySegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const matched = match[0];
    const base = match[1];
    if (!base) continue;
    const entry = names.find((candidate) => candidate.name.toLowerCase() === base.toLowerCase());
    if (!entry) continue;
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({
      kind: "entity",
      text: matched,
      slug: castSlug(entry.member),
      commonName: entry.member.commonName,
    });
    cursor = start + matched.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}

/** True when the linker found at least one entity — cheap render gate. */
export function hasEntities(segments: EntitySegment[]): boolean {
  return segments.some((segment) => segment.kind === "entity");
}
