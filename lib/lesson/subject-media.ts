import "server-only";
import type { LessonMediaItem } from "@/lib/lesson/media";
import { hasTaxa, matchesTopic } from "@/lib/outside/observations";
import { readSubjectEntity } from "@/lib/outside/place-photos";
import { taxonReference } from "@/lib/outside/taxon-reference";
import type { TopicTag } from "@/schema/pack";

/**
 * A picture of what today's lesson is actually about.
 *
 * Johan, 2026-08-17: *"if today we are talkign about trees i want a pic of a
 * common tree there.. if we talk about apple tree i want a pic of an apple
 * tree.. if we need photos of a rock i need image fetcher to show the rock.."*
 *
 * WHY THE LESSON HAD NO PICTURES. `projectLessonMedia` builds its row from
 * `outside.sightings`, which are Pointmoon's photographed observations near
 * the school. At a thinly recorded school there are none, so the row rendered
 * nothing at all — correct, honest, and useless to a teacher about to talk to
 * thirty children about trees.
 *
 * This is the floor under that. It does not invent a local sighting and it
 * never claims one: it finds a photograph of the SUBJECT, wherever that
 * photograph happens to have been taken. Johan, 2026-08-17: "an acorn doesnt
 * have to be near london.. just acorn is fine..."
 *
 * It runs only when the observation row came back empty. A real photographed
 * sighting always outranks a picture of the same thing from elsewhere, which
 * is the same order the cast uses when it puts `recorded` above `regional`.
 *
 * ── AND IT IS ABOUT THE LESSON, NOT ABOUT THE WEEK (#1019) ─────────────────
 *
 * The floor was built with no topic parameter at all. `names` is
 * `outside.usuallyAround` — the region's phenology for this week — and every
 * name in it went to the strip unread. On 2026-09-06 a lesson about collecting
 * fallen leaves showed Blackberry, Rosehip and Swallow Gathering: seasonally
 * true, topically unrelated, and not one leaf or tree among them. The
 * observation row above this has filtered on topic since #161 and narrows to
 * a tree genus since #1012; the fallback under it filtered on nothing, so at a
 * thinly recorded school — which is exactly when this runs — the strip was a
 * generic seasonal cast wearing the lesson's frame.
 *
 * `primaryTopic` is that missing parameter, and it is the SAME question the
 * door asks (`primaryTopicOf`, #339): one tag, the lesson's own subject, not
 * the union of its tags. A candidate's iconic taxon comes from the generated
 * taxon reference (#321), keyed on the scientific name the phenology row
 * already carries, and is put through `matchesTopic` — the one topic test in
 * this product, genus gate and all.
 *
 * A NAME THE REFERENCE DOES NOT KNOW FAILS THE FILTER, which is right rather
 * than harsh and is the rule `resolveDoor.servesTopic` already applies: the
 * rows with no taxon to look up are the ones that are not species at all —
 * "Autumn Colour", "Dawn Chorus", "First Frost".
 *
 * WHEN NOTHING SURVIVES, NOTHING RENDERS. There is deliberately no second
 * chance at the broad `topic` search for a taxon-bearing lesson: that search
 * is a keyword match over an encyclopaedia and is the door seasonal filler
 * would come back through. #324's rule for the door — it never pads — is this
 * row's rule too. Empty beats wrong.
 *
 * A lesson taxonomy cannot answer (art, seasons, senses, weather — roughly
 * forty per cent of sessions), or one with no primary topic authored, is
 * untouched: "does this creature match `art`?" has no meaning, and filtering
 * on it would empty the row for no reason.
 */

/** One named species this week expects, or a bare subject with no taxonomy. */
export interface SubjectMediaName {
  /** What the row prints. Always the common name a child would say. */
  name: string;
  /** The exact taxonomic identifier, when this names a real species (#233). */
  scientificName?: string | null;
}

export interface SubjectMediaQuery {
  /** The names this week expects, best first. Usually `outside.usuallyAround`. */
  names: readonly SubjectMediaName[];
  /** The session's own subject, used when the week has no names to offer. */
  topic?: string | null;
  /**
   * What this lesson is ABOUT, from `primaryTopicOf` (#1019). The names are
   * filtered to it; null, or a topic taxonomy cannot express, filters nothing.
   */
  primaryTopic?: TopicTag | null;
  /** The class's year group, so a definition is pitched at the right ear. */
  ageBand?: string | null;
  limit?: number;
}

interface Subject {
  /** What the row prints, and what the fallback (no scientific name) searches. */
  displayName: string;
  /** The exact identifier to search when this is a named species. */
  scientificName: string | null;
}

/**
 * The subjects this lesson is actually about (#1019).
 *
 * The iconic taxon is read from the generated taxon reference rather than
 * asked of the phenology row, which has never carried one, and the match is
 * `matchesTopic` so the `trees`/`soil` genus gate (#962, #1012) applies here
 * exactly as it does to a real sighting. A name with no scientific name, or
 * one the reference does not know, cannot answer the question and is dropped.
 * Order is preserved: the week ranked these, and this only removes.
 */
async function onTopic(subjects: readonly Subject[], topic: TopicTag): Promise<Subject[]> {
  const verdicts = await Promise.all(
    subjects.map(async (subject) => {
      const reference = await taxonReference(subject.scientificName).catch(() => null);
      return matchesTopic(reference?.iconicTaxon ?? undefined, [topic], subject.scientificName);
    })
  );
  return subjects.filter((_, index) => verdicts[index]);
}

/**
 * One row of subject photographs, or nothing.
 *
 * Never throws: a failed or empty read returns `[]` and the strip renders
 * nothing, exactly as it did before this existed.
 */
export async function subjectMediaFor(query: SubjectMediaQuery): Promise<LessonMediaItem[]> {
  const limit = Math.min(Math.max(query.limit ?? 3, 1), 6);

  // The week's own names first, because "what is around now" is a better
  // subject than the lesson's abstract topic: a class told to look at trees
  // is better served by the oak that is actually here than by "tree".
  const named: Subject[] = query.names
    .map((n) => ({ displayName: n.name.trim(), scientificName: n.scientificName?.trim() || null }))
    .filter((s) => s.displayName.length > 0);

  // The topic gate (#1019). Only a lesson whose subject taxonomy can answer
  // is filtered; everything else keeps the behaviour it had.
  const topic = query.primaryTopic ?? null;
  const gated = topic !== null && hasTaxa(topic);
  const subjects = (gated ? await onTopic(named, topic) : named).slice(0, limit);

  // A gated lesson with nothing on topic shows nothing. Falling through to
  // the broad subject search here is how seasonal filler got in.
  if (gated && subjects.length === 0) return [];

  if (subjects.length === 0 && query.topic?.trim()) {
    // The lesson's own topic ("look for seeds") names no species at all, so
    // there is no scientific claim to gate — a broad answer is the honest
    // answer here, exactly as it always was.
    subjects.push({ displayName: query.topic.trim(), scientificName: null });
  }
  if (subjects.length === 0) return [];

  const reads = await Promise.all(
    subjects.map(async (subject) => {
      // THE EXACT-TAXON GATE (#233). A named species carries an identity —
      // its scientific name — and only a lookup keyed on that identity may
      // stand for it. Johan, 2026-08-24: a Wikimedia image titled "American
      // Bird Grasshopper" rendered for a link to /species/chorthippus-brunneus
      // (Common field grasshopper), because the common-name search ("grasshopper")
      // is a keyword match over an encyclopaedia and can resolve to a related
      // but different species, while the surrounding entity kept the specific
      // one's name and slug.
      //
      // So a named species is looked up BY that name and no other. When the
      // exact lookup fails, the honest answer is no photograph for this
      // subject, never a broader search that could hand back a different
      // animal wearing this one's label. Only a subject with no scientific
      // name at all — a topic, a rock, a season — ever reaches the broad
      // common-name search, and that is fine, because nothing there claims to
      // be a particular species.
      const entity = await readSubjectEntity(subject.scientificName ?? subject.displayName).catch(
        () => null
      );
      if (!entity?.photo) return { subject, entity: null };
      // A model pass used to try rephrasing the encyclopaedia's sentence into
      // words a young child holds. Its guard required every content word to
      // come from the source, which forbids the substitution that simplifying
      // IS, so it refused 20 of 20 measured drafts and had almost certainly
      // never returned one (#414). The sentence a teacher reads is the
      // encyclopaedia's own, which is what she has always actually seen.
      return { subject, entity };
    })
  );

  const seen = new Set<string>();
  const items: LessonMediaItem[] = [];
  for (const read of reads) {
    const entity = read.entity;
    const photo = entity?.photo;
    if (!entity || !photo || seen.has(photo.url)) continue;
    seen.add(photo.url);
    items.push({
      id: `subject:${photo.id}`,
      // Always the common name a child would say, never the scientific
      // string used to find the picture.
      name: read.subject.displayName,
      scientificName: read.subject.scientificName,
      definition: entity.definition,
      definitionSource: entity.sourceUrl,
      // Never `hyperlocal`. That word means a five-kilometre presence receipt
      // travelled with an observation, and nothing here has one.
      kind: "reference",
      radiusKm: null,
      observedAt: null,
      sourceUrl: photo.sourceUrl,
      locality: photo.locality,
      photo: {
        url: photo.url,
        role: "taxon-reference",
        attribution: photo.credit,
        license: photo.license,
        sourceUrl: photo.sourceUrl,
      },
    });
  }

  return items.slice(0, limit);
}
