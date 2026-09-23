import Link from "next/link";
import { getTodayRead, type TodayReadQuery } from "@/lib/outside/today";
import { OUTSIDE_DOOR_CAPTION, type OutsideScope } from "@/lib/outside/captions";
import { castSlug, displayPhotoUrl, type CastMember } from "@/lib/cast/member";
import { SkyMark } from "./SkyMark";
import styles from "./today.module.css";

/**
 * The two halves of the morning that need the network (#323, redesigned #341).
 *
 * They live here rather than inside `app/page.tsx` for one structural reason:
 * the page is a COMPOSITION and everything in it should be readable without a
 * fetch. Both of these await Pointmoon and the cast, and both sit behind their
 * own Suspense boundary so the lesson paints without them.
 *
 * Every streamed piece calls `getTodayRead` with the SAME query object, which
 * the page builds once. `getTodayRead` is wrapped in React's `cache`, which
 * keys on argument identity: one composition serves the weather and doorway,
 * so they cannot disagree about what was seen this morning.
 */

/**
 * THE DAY — what it is like out there, and only that (2026-09-08).
 *
 * ── THE LADDER IS GONE, AND THAT IS THE POINT ──────────────────────────────
 *
 * Johan, on Today: *"the top slot can become smaller and less relevant. we can
 * add the lesson note on the runner inside with a conditions or something
 * label only when we have it"*.
 *
 * This slot used to run a three-rung ladder — the authored hinge, then the
 * day's adjustment line, then the composed read — so the same pixels were
 * advice about this lesson on a wet Tuesday and a weather report on a mild
 * one, and a teacher who learnt the slot on Monday was reading a different
 * kind of thing in it on Tuesday with nothing saying the slot had changed
 * meaning. Sophia's sketch names that failure exactly
 * (docs/concepts/today-hinge-placement-2026-09-08.html).
 *
 * So there is ONE SOURCE now and there is no ladder: `today.read`, the
 * composed sentence, every morning the weather came back at all. Null renders
 * nothing, exactly as before — the block is simply absent and the page is
 * shorter.
 *
 * WHERE THE OTHER TWO WENT.
 *   - The authored hinge reads in the RUNNER, on the day screen, under the
 *     label "Today's conditions" with a drawn mark for the kind that matched
 *     (`app/run/HybridJourney.tsx`, `app/ConditionMark.tsx`). Advice about the
 *     lesson now sits beside the lesson it is advice about, instead of two
 *     blocks above it and one screen away.
 *   - The day's adjustment line does not render on Today at all. It is not
 *     deleted from the product: `cardCondition` still produces it and
 *     `app/DailyCard.tsx` and the /outside brief (`lib/outside/brief.ts`)
 *     still read it. Nothing here removes a producer.
 *
 * ── AND IT IS SMALLER, WHICH IS ALSO THE POINT ─────────────────────────────
 *
 * *"the top slot can become smaller and less relevant"*. `.read` steps down
 * one step of the scale (`--size-4` to `--size-3`) and takes `--ink-soft`
 * instead of `--ink`. The sky mark and the temperature are untouched: they are
 * what she is checking when she is only checking one thing, and the sentence
 * is what they mean.
 *
 * ── WHAT IS NOT HERE YET, AND WHY IT IS NOT A PLACEHOLDER ──────────────────
 *
 * The sheet put a drawn weather band above this sentence. Johan rejected the
 * drawing on sight — *"the drawings are ugly... just more iconography"* — and
 * the block is being respecified as an icon set. It is deliberately NOT built
 * here and NOT stubbed: what stands in its place is the readings line this
 * screen already shipped, narrowed to the two facts the sentence does not
 * carry. Nothing new is designed, nothing is lost, and when the icon spec
 * lands it replaces this line rather than being fitted around it.
 *
 * The narrowing matters and is the reason this is not simply the old row: the
 * sentence now always names the ground when the ground is not dry, so a
 * readings line that also said "ground damp underfoot" would be the same fact
 * twice — which is the exact fault that deleted three labels from the sheet.
 */
export async function TodayDay({
  query,
  showReadLabel = true,
}: {
  query: TodayReadQuery;
  showReadLabel?: boolean;
}) {
  const today = await getTodayRead(query);

  const nothing =
    today.skyMark === null && today.temperature === null && today.ground === null;

  // The honest nothing. It is a footnote about our instruments, not a headline
  // about her morning, and the page it sits on is simply shorter.
  if (nothing) {
    return (
      <p className={styles.quiet}>
        We could not see outside today, so there is nothing new to report. Your
        plan is unchanged.
      </p>
    );
  }

  // ONE SOURCE. Not the first of three that is not null — the read, or
  // nothing. See the header: the hinge reads in the runner and the adjustment
  // does not read on this screen at all.
  const reason = today.read;

  return (
    <>
      {/* THE WEATHER LEADS NOW, AND THE SENTENCE SITS UNDER IT (#355).
          Johan: "maybe hierarchy weather first top + the line lower then
          species.. remove the break line after species".

          This supersedes the read-on-top arrangement of two hours ago, and it
          is better for a reason worth keeping: the sentence stops being a
          headline the instruments then repeat, and becomes what the
          instruments MEAN. A mark, a number, and under them a line in a
          person's word order — that is the whole block, read top to bottom in
          the order someone actually looks.

          It is also what finally licenses the mark without a label. The word
          that says what the glyph is now sits directly beneath it, in prose,
          in the reading order — which is exactly what rule 2 asked for and
          what "Overcast · a light breeze" was doing badly. */}
      <section className={styles.day}>
        <div className={styles.sky}>
          {/* THE SKY: one mark, and the word under it is the licence. */}
          {today.skyMark && (
            <div className={styles.skyReading}>
              <div className={styles.skyMark}>
                <SkyMark kind={today.skyMark} size={64} />
                {today.temperature && (
                  <p className={styles.temp}>
                    {/* THE DEGREE MARK IS DRAWN WITH THE SAME PEN as the mark
                        beside it — a 10px ring at 2px, not the `°` character,
                        which would carry Nunito's own sidebearing and weight
                        and visibly not be the same line. */}
                    {stripDegree(today.temperature).value}
                    <span className={styles.degRing} aria-hidden="true" />
                    <span className={styles.degScale}>
                      {stripDegree(today.temperature).scale}
                    </span>
                    <span className={styles.srOnly}>{today.temperature}</span>
                  </p>
                )}
              </div>

            </div>
          )}

          {/* THE GROUND MOVED INTO THE SENTENCE (#355), and this is a
              subtraction rather than a loss. Johan asked for the top read to
              be fuller, and the prototype he is holding up gets its fullness
              from a second sentence about the ground — "Ground's firm and dry
              underfoot." So `dayRead` now says it, which means a bold "dry
              underfoot" here would be the same fact printed twice, forty
              pixels apart, in two registers. That is the exact fault that
              took `skyLabel` off this block in the same pass.
              The split by owner is now clean and total: THE SENTENCE OWNS THE
              SKY, THE AIR AND THE GROUND. THE BLOCK OWNS THE MARK AND THE
              NUMBER. Nothing on this screen says one thing twice. */}
        </div>
      </section>
      {reason && (
        <div className={styles.readBlock}>
          {/* THE PROTOTYPE'S OWN LABEL, WITH ITS MARK (#355). Johan, holding
              the old prototype: "it seemed like generally had a good
              hierarchy". The dot is what made that label read as a live
              instrument rather than a heading, and it is an honest claim
              here: this composition is read per request against a fifteen-
              minute window, so what it says is what was outside this morning.
              It is drawn, not the "•" character, for the same reason the
              degree ring is drawn — a glyph would carry Nunito's own weight
              and sidebearing and visibly not be part of the line. */}
          {showReadLabel && <p className={styles.readLabel}>
            <span className={styles.liveDot} aria-hidden="true" />
            Outside now{today.school ? ` · ${today.school}` : ""}
          </p>}
          <p className={styles.read}>{reason}</p>
        </div>
      )}

    </>
  );
}

/**
 * Split "15°C" into the number and its scale letter so the degree mark can be
 * DRAWN between them. The producer's own string is kept whole for screen
 * readers, because "15" followed by a decorative ring reads as fifteen.
 */
function stripDegree(temperature: string): { value: string; scale: string } {
  const match = /^(-?\d+)\s*°?\s*([CF]?)$/.exec(temperature.trim());
  if (!match) return { value: temperature, scale: "" };
  return { value: match[1] ?? temperature, scale: match[2] ?? "" };
}

/** The compact doorway belongs to the live read, not inside the lesson card. */
export async function TodayDoor({
  query,
  sessionId,
}: {
  query: TodayReadQuery;
  sessionId: string;
}) {
  const today = await getTodayRead(query);

  return today.outsideAvailable ? (
    <OutsideDoor
      faces={today.doorFaces}
      scope={today.scope}
      sessionId={sessionId}
    />
  ) : null;
}

/**
 * THE DOOR THROUGH — its wording is a claim, and its faces are a preview
 * (#355).
 *
 * ── THE WORDING ────────────────────────────────────────────────────────────
 *
 * Johan wrote "see what's happening in your grounds". This says "around your
 * school", changed by one word, because what it opens is NOT the grounds:
 * /outside heads its strong tier "Seen near your school lately" — photographed
 * observations within a radius, not on the field — and its second tier
 * "Usually around here now", which `lib/outside/captions.ts` records can cover
 * a region "a continent wide".
 *
 * `lib/lesson/door.ts` already prints the opposite sentence out loud: "Nobody
 * has recorded these on your grounds. They are what the season brings to this
 * region." A button claiming the grounds would contradict, on the same screen,
 * the line the product uses to stay honest about exactly this distinction.
 *
 * THE FACES DO NOT QUIETLY RE-MAKE THAT CLAIM. They are drawn from the same
 * two tiers the row above them is drawn from, so they claim exactly what the
 * row claims and nothing more. Nothing in this control says "here".
 *
 * ── THE SHAPE ──────────────────────────────────────────────────────────────
 *
 * Johan: *"fix the terible button... maybe with 2-3 avatars... of the animals
 * pics"*.
 *
 * This now sits immediately under the weather read and above the lesson card:
 * a small, softly filled button with the preview first and the words beside
 * it. Up to three 28px crops overlap so they read as one compact stack, not a
 * second species row. The button shape makes the affordance explicit without
 * competing with the full-width Enter action.
 *
 * ── THE TWO RULES THAT BIND THE CROPS ──────────────────────────────────────
 *
 * A CROP IS A PHOTOGRAPH. The whole control is ONE link to /outside, and
 * /outside renders `CastFace` at its default size, which renders `PhotoCredit`
 * under every face that has a photograph. That satisfies CC BY 4.0 §3(a)(2)
 * without putting three separate links inside one row — and it only holds
 * because both surfaces now read the cast to the same depth. See
 * `CAST_DEPTH` in lib/cast/surface.ts for the trap that closes.
 *
 * THEY NEVER FALL BACK TO A DRAWN MARK. `lib/outside/today.ts` selects them
 * with the same `displayPhotoAsset(m) !== null` filter that governs the row.
 * A drawn taxon mark beside a photograph reads as a photograph that failed to
 * load (#178), and at 34px it would read as one even on its own. This renders
 * `displayPhotoUrl` directly rather than going through `CastFace`, which is
 * the only place in the app that draws a plate under a portrait — so there is
 * no code path here that can produce a plate at all.
 *
 * `aria-hidden`, and that is not an omission. The link's text already says
 * where it goes; three unnamed circles announced after it would be three
 * species named to a screen-reader user that the page never names to anyone
 * else. They are a preview, so they are decorative, so they say nothing.
 */
function OutsideDoor({
  faces,
  scope,
  sessionId,
}: {
  faces: CastMember[];
  scope: OutsideScope;
  sessionId: string;
}) {
  return (
    <Link
      className={styles.door}
      href={`/outside?session=${encodeURIComponent(sessionId)}`}
    >
      {faces.length > 0 && (
        <span className={styles.doorFaces} aria-hidden="true">
          {faces.map((member) => {
            const url = displayPhotoUrl(member);
            return url ? (
              <span key={castSlug(member)} className={styles.doorFace}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" loading="lazy" decoding="async" />
              </span>
            ) : null;
          })}
        </span>
      )}
      <span className={styles.doorWords}>{OUTSIDE_DOOR_CAPTION[scope]}</span>
      {/* DRAWN WITH THE SAME PEN as the sky marks and the degree ring: a 2px
          stroke with round caps, not a "›" character carrying Nunito's weight
          into a row of drawn objects. */}
      <svg
        className={styles.doorChev}
        viewBox="0 0 18 12"
        width={18}
        height={12}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 6h15M16 6l-5-5M16 6l-5 5" />
      </svg>
    </Link>
  );
}
