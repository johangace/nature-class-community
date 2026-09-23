import { z } from "zod";
import { extractWorldFactsFromPhoto, isModelAvailable } from "@/lib/ai/plate-draft";
import { guardAiRoute, privateJson } from "@/lib/ai/api-guard";
import { speciesAllowlistFor } from "@/lib/outside/species-allowlist";
import { getActiveClassLocation } from "@/lib/teacher";

export const dynamic = "force-dynamic";

/**
 * #377 · The onboarding photograph endpoint. One client-downscaled photo of
 * the teacher's own grounds in, candidate place facts out — the sibling of
 * `/api/world-intake`, on the same guarded AI boundary (authed, rate-limited
 * on the shared per-teacher ledger, cross-site blocked, `no-store`).
 *
 * NO STORAGE, and that is the whole contract (#377's binding guarantee): the
 * image is read from the request, handed to the model call, and gone. It is
 * never written to disk, never logged, never traced, never attached to a
 * WorldFact — only the resolved candidates may persist, and only after she
 * confirms them in the client. If the model reports a person in frame the
 * read is refused and nothing survives at all.
 *
 * The species allowlist comes from the local seasonal record, resolved here
 * server-side — never from the client, so a tampered request cannot widen
 * what the parser will admit.
 */

/** ~512px JPEG at quality 0.7 is ~40–80KB; base64 inflates by 4/3. The cap
 * refuses anything an un-downscaled camera original would produce. */
const MAX_IMAGE_BASE64 = 400_000;

const requestSchema = z
  .object({
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    image: z
      .string()
      .min(1)
      .max(MAX_IMAGE_BASE64)
      .regex(/^[A-Za-z0-9+/=]+$/),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  if (!isModelAvailable()) return privateJson({ available: false, draft: null });

  let candidate: unknown;
  try {
    candidate = await request.json();
  } catch {
    return privateJson({ error: "invalid-json" }, 400);
  }
  const parsed = requestSchema.safeParse(candidate);
  if (!parsed.success) return privateJson({ error: "invalid-request" }, 400);

  // What is actually recorded near this school this month, by the people who
  // recorded it — the record standing in for her words. No location yet (a
  // first-run teacher photographing before her class row has coordinates)
  // means an empty allowlist: features can still come back, species cannot,
  // and nothing is invented to fill the gap.
  const location = await getActiveClassLocation().catch(() => null);
  const allowedSpecies = (
    await speciesAllowlistFor(location?.lat, location?.lng)
  ).species.map((species) => species.name);

  const draft = await extractWorldFactsFromPhoto({
    image: { mediaType: parsed.data.mediaType, base64: parsed.data.image },
    allowedSpecies,
  });
  return privateJson({ available: true, draft });
}
