import { z } from "zod";
import { guardAiRoute, privateJson } from "@/lib/ai/api-guard";
import { getSpeciesSource } from "@/lib/outside/species-source";
import { draftSpeciesLearning } from "@/lib/ai/species-learning";
import { requestLocale } from "@/lib/request-locale";
import { localizeText } from "@/lib/localization";

export const dynamic = "force-dynamic";
const name = z.string().trim().min(1).max(160).refine((s) => !/[<>\n\r]/.test(s));
const schema = z.object({ commonName: name, scientificName: name.nullable() }).strict();

/** Same guarded model boundary as photo identification; accepts no photo,
 * location or user-written facts. Scientific-name lookup verifies the source. */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid-request" }, 400);
  let stage = "source";
  try {
    const source = await getSpeciesSource(parsed.data);
    if (!source) return privateJson({ result: null, reason: "source-unavailable" }, 503);
    stage = "draft";
    const learning = await draftSpeciesLearning({ ...parsed.data, source });
    if (!learning) return privateJson({ result: null, reason: "story-unavailable" }, 503);
    stage = "locale";
    const locale = await requestLocale();
    const protectedNames = [parsed.data.commonName, parsed.data.scientificName ?? ""];
    stage = "response";
    return privateJson({ result: {
      learning: Object.fromEntries(Object.entries(learning).map(([key, text]) => [key, localizeText(text, locale, protectedNames)])),
      source: { title: source.title, url: source.url },
    } });
  } catch {
    console.warn("[species-learning] request-failed", stage);
    return privateJson({ result: null, reason: "story-unavailable" }, 503);
  }
}
