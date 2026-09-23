import { z } from "zod";
import { GROUP_NOUNS, type GroupNoun } from "@/lib/group-profile";
import { sessionSchema, type Session } from "@/schema/pack";
import type { LessonHazards } from "@/lib/lesson/hazards";
import type { SpokenAudio } from "@/lib/lesson/spoken-audio";

const opaqueOwnerScopeSchema = z.string().regex(/^ofs_[a-f0-9]{32}$/);
const opaqueLeaseIdSchema = z.string().regex(/^ofl_[a-f0-9]{32}$/);
const sameOriginPathSchema = z.string().regex(/^\/(?!\/)/);

export const offlineOwnerLeaseV1Schema = z
  .object({
    version: z.literal(1),
    ownerScope: opaqueOwnerScopeSchema,
    leaseId: opaqueLeaseIdSchema,
    contentRevision: z.string().max(80).optional(),
    issuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type OfflineOwnerLeaseV1 = z.infer<typeof offlineOwnerLeaseV1Schema>;

export const preparedFieldResourceV1Schema = z
  .object({
    kind: z.enum(["audio", "image"]),
    url: sameOriginPathSchema,
    required: z.boolean(),
  })
  .strict();

export type PreparedFieldResourceV1 = z.infer<
  typeof preparedFieldResourceV1Schema
>;

const hazardEntrySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    note: z.string().min(1),
    recordedAs: z.string().min(1).optional(),
  })
  .strict();

const lessonHazardsSchema: z.ZodType<LessonHazards> = z
  .object({
    entries: z.array(hazardEntrySchema),
    source: z.enum(["pack", "starter"]),
  })
  .strict();

const spokenAudioSchema: z.ZodType<SpokenAudio> = z.record(
  z.string(),
  z
    .object({
      src: sameOriginPathSchema,
      seconds: z.number().finite().nonnegative(),
    })
    .strict(),
);

/**
 * THE WORD FOR THE PEOPLE IN FRONT OF HER, IN HER POCKET (#1266).
 *
 * `app/field` renders the same runner as `app/run` from a prepared envelope in
 * local storage, with no server read of anything — that is the whole point of
 * it working with no signal. So the noun #1214 wired through `app/run` cannot
 * reach it as context from a page; it has to travel inside the envelope.
 *
 * Two contract decisions, recorded here rather than inherited:
 *
 *   AN OLD ENVELOPE IS READ, NOT REFUSED. The field is the offline surface,
 *   and a stored envelope is the only copy of a lesson a teacher may have on a
 *   playground. Refusing one over a missing word would take her lesson away to
 *   fix its grammar. So the key is optional on `version: 1` rather than a v2:
 *   an envelope prepared before this change carries no noun and resolves to
 *   "class" — `groupNoun`'s own documented default, and the honest answer for
 *   an audience the envelope never recorded.
 *
 *   A NOUN THAT WENT STALE STAYS STALE UNTIL THE NEXT PREPARATION. A teacher
 *   who prepares a lesson and then edits her group type has the old word in her
 *   pocket, exactly as she has the old lesson text, the old selected safety and
 *   the old conditions receipt; `staleAfter` and the next prepare correct all
 *   four together. The alternative was to fold the noun into the lease's
 *   `contentRevision`, which is checked for equality against the live owner —
 *   and a mismatch there does not refresh a noun, it makes the whole prepared
 *   lesson `unavailable` and sends her to find a signal (`prepared-store.ts`,
 *   `refresh-language.ts`). Blocking a lesson in a field over a changed word is
 *   the worse trade of the two.
 *
 * Optional is enough for the READER and not enough for the WRITER, which is the
 * asymmetry `PREPARED_OVERLAY_FEATURES` below exists for.
 */
export type { GroupNoun } from "@/lib/group-profile";

/**
 * WHAT THE CALLER SAYS IT CAN PARSE (#1266, both halves found reviewing PR
 * #1268).
 *
 * The envelope is `.strict()`, so an unknown key does not degrade — it refuses
 * the whole payload. Making `groupNoun` optional lets a NEW reader accept an
 * OLD envelope. It does nothing for the reverse, and the reverse is a real
 * deployment path here rather than a hypothetical one:
 *
 *   A tab opened before the deploy goes on executing its old JavaScript. Its
 *   `/api/offline/prepare` request is `NetworkOnly` (`app/sw.ts`), so it
 *   reaches the NEW server, which answers with a key that client's schema has
 *   never heard of. `prepare-client` parses that response with `.strict()`
 *   before saving, so the preparation throws and the teacher is told it failed
 *   — while she was online, doing exactly what the button offered. Nothing in
 *   this repository pins an open document to its own deployment.
 *
 * So the emitter negotiates: the client declares the additive fields its own
 * schema knows, and the server sends only those. A caller that declares
 * nothing — every build from before this change — receives byte-identically
 * what it received yesterday. Additive keys after this one join the list and
 * inherit the path.
 *
 * THE DECLARATION TRAVELS AS A HEADER, AND THAT IS THE WHOLE POINT OF IT.
 *
 * The first attempt put it in the request body, which fails the mirror case:
 * roll this deployment back with a tab from it still open, and that tab posts
 * the new key to the PREVIOUS endpoint, whose request schema is `.strict()`
 * over exactly two fields — so it answers 400 before preparing anything, even
 * though its own overlay would have been perfectly parseable by that client. A
 * header is ignored by an endpoint that does not read it, so the same one
 * mechanism closes both directions in a single deployment, with no staged
 * server-first rollout and no change to the request schema at all.
 *
 * Unknown names in the header are dropped rather than refused, which closes the
 * third direction too: a client NEWER than the server can declare a field this
 * build has never heard of and still get a preparation, because a server only
 * ever emits what it can itself name.
 *
 * The STORED side needs no negotiation, and that is a property of the code
 * rather than an assumption: the envelope lives at one shared IndexedDB key,
 * and `classifyPreparedFieldState` answers an unparseable value with
 * `unavailable` / `"invalid"` rather than throwing (`prepared-store.ts`). An
 * old tab reading an envelope a new tab wrote falls back to the basic public
 * lesson and recovers on its next load, which is what already happens for
 * every other unreadable envelope.
 */
export const PREPARED_OVERLAY_FEATURES = ["group-noun"] as const;
export type PreparedOverlayFeature = (typeof PREPARED_OVERLAY_FEATURES)[number];

export const PREPARED_OVERLAY_FEATURES_HEADER = "x-prepared-overlay-features";

/** The longest declaration worth reading; a header is caller-controlled. */
const PREPARED_OVERLAY_FEATURES_HEADER_MAX = 200;

/**
 * Read a declaration off the wire. Absent, empty, malformed and unknown all
 * mean the same safe thing — emit nothing additive — because the caller's
 * schema is the thing being described and silence cannot be read as consent.
 */
export function parsePreparedOverlayFeatures(
  header: string | null | undefined,
): PreparedOverlayFeature[] {
  if (!header) return [];
  const known = new Set<string>(PREPARED_OVERLAY_FEATURES);
  const declared = new Set<PreparedOverlayFeature>();
  for (const part of header.slice(0, PREPARED_OVERLAY_FEATURES_HEADER_MAX).split(",")) {
    const name = part.trim().toLowerCase();
    if (known.has(name)) declared.add(name as PreparedOverlayFeature);
  }
  return [...declared];
}

export interface PreparedFieldOverlayV1 {
  version: 1;
  ownerScope: string;
  ownerLeaseId: string;
  sessionId: string;
  coreFingerprint: string;
  preparedAt: string;
  staleAfter: string;
  groupNoun?: GroupNoun;
  session: Session;
  hazards: LessonHazards | null;
  spokenAudio: SpokenAudio;
  conditions: {
    summary: string;
    capturedAt: string;
    source: string;
  } | null;
  resources: PreparedFieldResourceV1[];
}

export const preparedFieldOverlayV1Schema: z.ZodType<PreparedFieldOverlayV1> = z
  .object({
    version: z.literal(1),
    ownerScope: opaqueOwnerScopeSchema,
    ownerLeaseId: opaqueLeaseIdSchema,
    sessionId: z.string().min(1),
    coreFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    preparedAt: z.iso.datetime(),
    staleAfter: z.iso.datetime(),
    groupNoun: z.enum(GROUP_NOUNS).optional(),
    session: sessionSchema,
    hazards: lessonHazardsSchema.nullable(),
    spokenAudio: spokenAudioSchema,
    conditions: z
      .object({
        summary: z.string().min(1),
        capturedAt: z.iso.datetime(),
        source: z.string().min(1),
      })
      .strict()
      .nullable(),
    resources: z.array(preparedFieldResourceV1Schema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.session.id !== value.sessionId) {
      context.addIssue({
        code: "custom",
        path: ["sessionId"],
        message: "Prepared session id does not match its payload",
      });
    }
  });

export interface PreparedFieldEnvelopeV1 {
  version: 1;
  lease: OfflineOwnerLeaseV1;
  overlay: PreparedFieldOverlayV1;
}

export const preparedFieldEnvelopeV1Schema: z.ZodType<PreparedFieldEnvelopeV1> = z
  .object({
    version: z.literal(1),
    lease: offlineOwnerLeaseV1Schema,
    overlay: preparedFieldOverlayV1Schema,
  })
  .strict();
