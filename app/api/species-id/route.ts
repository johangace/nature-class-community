import { z } from "zod";
import { guardAiRoute, privateJson } from "@/lib/ai/api-guard";
import { isModelAvailable } from "@/lib/ai/model";
import { identifySpecies } from "@/lib/ai/species-id";
import { speciesAllowlistFor, type SpeciesAllowlist } from "@/lib/outside/species-allowlist";
import { getActiveClassLocation } from "@/lib/teacher";

export const dynamic = "force-dynamic";

/**
 * #378 · What is this? — the in-run identification endpoint, on the same
 * guarded AI boundary as every other AI route (authed, rate-limited on the
 * shared per-teacher ledger, cross-site blocked, `no-store`).
 *
 * Nearby records are optional context. A missing location or an unavailable
 * observation feed must not prevent identification of a visible organism.
 * Photographs are read once and kept nowhere, as on /api/world-photo.
 */

const MAX_IMAGE_BASE64 = 400_000;

/**
 * No location, or a failed read: no records, and so no claim to make. A
 * factory rather than a constant, for the reason `species-allowlist.ts` gives.
 */
const noRecords = (): SpeciesAllowlist => ({ species: [], recentWindowDays: null });

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
  if (!isModelAvailable()) return privateJson({ available: false, answer: null });

  let candidate: unknown;
  try {
    candidate = await request.json();
  } catch {
    return privateJson({ error: "invalid-json" }, 400);
  }
  const parsed = requestSchema.safeParse(candidate);
  if (!parsed.success) return privateJson({ error: "invalid-request" }, 400);

  const location = await getActiveClassLocation().catch(() => null);
  const allowlist = location
    ? await speciesAllowlistFor(location.lat, location.lng).catch(noRecords)
    : noRecords();

  const answer = await identifySpecies({
    image: { mediaType: parsed.data.mediaType, base64: parsed.data.image },
    candidates: allowlist.species,
  });
  if (!answer) return privateJson({ available: true, answer: null });

  return privateJson({
    available: true,
    answer: {
      name: answer.name,
      scientificName: answer.scientificName,
      note: answer.note,
      // The matched record's own tier, and the window that bounds the recent
      // one, so the surface can say what is true rather than one fixed
      // sentence (#401). `recentWindowDays` travels even on a seasonal answer
      // because the surface, not the route, decides what to do with it.
      evidence: answer.evidence,
      recentWindowDays: allowlist.recentWindowDays,
    },
  });
}
