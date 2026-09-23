import { requestLocale } from "@/lib/request-locale";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadPack } from "@/lib/pack";
import {
  START_FLOW_COOKIE,
  getActiveClass,
  getTeacher,
} from "@/lib/teacher";
import { StartFlow } from "./StartFlow";
import { parseTryPlace, TRY_PLACE_COOKIE } from "@/lib/try-place";
import { examplePlaceAt } from "@/lib/example-places";
import {
  localizeText,
} from "@/lib/localization";

/**
 * /start is the two-question first run: who the teacher is taking outside and
 * where they plan to go. The class is written only when both answers are ready,
 * then the flow redirects straight to Today. Richer Class and Grounds details
 * remain optional work in those profiles (#878).
 *
 * A start-flow cookie still makes the final write reload-safe: if navigation
 * is interrupted after the class was saved, the teacher resumes on location
 * and reuses that row instead of creating a duplicate (#94).
 */
export const dynamic = "force-dynamic";

/**
 * Not for search engines (#877). Signed out this page asks one question and
 * answers it with a live read; a crawler has no question to ask, and the
 * public conditions read behind it should not be walked by one.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function StartPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string }>;
}) {
  const teacher = await getTeacher();
  const jar = await cookies();
  const localeOverride = (await searchParams)?.locale;
  // The spot a signed-out visitor chose, when she did (#877). Signed out it
  // seeds the try screen so a reload keeps her place; signed in with no class
  // yet it seeds the class setup, so the one thing she already told us is not
  // asked twice.
  const remembered = parseTryPlace(jar.get(TRY_PLACE_COOKIE)?.value);
  // ...but a NAMED EXAMPLE is not a place she told us about (#877, third
  // slice; caught in review). She picked Phoenix off a list to see the product
  // work somewhere that is not hers. Seeding the class setup with it would let
  // her save that patch as her school's location without ever choosing her own
  // place — the one thing this flow exists to ask. It still seeds the
  // signed-out try screen, where it is simply the example she is looking at.
  const rememberedOwnPlace = examplePlaceAt(remembered) ? null : remembered;

  if (!teacher) {
    const browserLocale = await requestLocale();
    return (
      <StartFlow
        mode="try"
        locale={
          localeOverride === "us" || localeOverride === "uk"
            ? localeOverride
            : browserLocale
        }
        remembered={remembered}
        shelf={{ sessionCount: 0, firstTitle: "", packTitle: "" }}
      />
    );
  }

  const active = await getActiveClass(teacher.id);

  // A class only keeps a teacher in the flow if it is the one this flow made.
  // Anything else — no marker, a stale marker, a marker naming a class they
  // have since deleted or switched away from — bounces, exactly as before.
  const resuming =
    active !== null && jar.get(START_FLOW_COOKIE)?.value === active.id;
  if (active && !resuming) redirect("/today");

  const pack = loadPack("autumn-starter");
  const firstSession = pack.sessions[0];
  const locale = await requestLocale(
    localeOverride,
    active ? { lat: active.lat, lng: active.lng } : undefined,
  );

  return (
    <StartFlow
      locale={locale}
      // Seeded only when resuming, so a reload mid-flow reuses the row the
      // flow already created instead of leaving a second class behind — and
      // never from a named example, which is not her place (see above).
      remembered={rememberedOwnPlace}
      resume={
        resuming && active
          ? {
              classId: active.id,
              name: active.name,
              yearGroup: active.yearGroup,
              groupType: active.groupType,
              ageRange: active.ageRange,
              school: active.school,
              lat: active.lat,
              lng: active.lng,
            }
          : null
      }
      shelf={{
        sessionCount: pack.sessions.length,
        firstTitle: localizeText(firstSession?.title ?? "", locale),
        packTitle: localizeText(pack.title, locale),
      }}
    />
  );
}
