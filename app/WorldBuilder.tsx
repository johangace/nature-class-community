"use client";

import { localizeText, type Locale } from "@/lib/localization";

import { useRef, useState } from "react";
import { REACH_OPTIONS, SITE_FEATURES } from "@/app/start/vocab";
import { recordWorldFactDecisions } from "@/app/worldChatActions";
import { MAX_INPUT_LEN, PHOTO_QUOTE } from "@/lib/ai/world-extract-contract";
import type { WorldFactCandidate } from "@/lib/ai/plate-draft";
import styles from "@/app/world.module.css";

/**
 * Building your world: zooms three and four, shared by onboarding and settings.
 *
 * One component in two places on purpose. A school gets a pond in March, a tree
 * comes down in a storm, a new grounds contractor mows the wild corner. If the
 * only way to say so were the onboarding flow she completed in September, her
 * world would be frozen at the moment she signed up, and Johan's ruling on
 * 2026-08-17 was that nothing here should be frozen: things are fluid, and
 * anything not seasonally fresh is bad.
 *
 * So this is the same screen twice, and it edits the same three columns. What
 * differs between the two callers is only the framing above it.
 *
 * ZOOMS ONE AND TWO ARE NOT HERE, and that is not an omission. Zoom one is what
 * this region is doing this week, and zoom two is what a map can see: both are
 * read rather than answered, so they render server-side above this component
 * and nothing about them is editable. What she can change is what she alone
 * knows, which is zooms three and four.
 *
 * Chrome-free per T1 (#231): the options are words with a rule under them, not
 * boxes. Nothing here is defined by a border.
 *
 * ZOOM ZERO, THE ASSISTANT CHAT (#280): a free-form box above the pills. She
 * writes a sentence in her own words, the model reads candidate facts back
 * to her — each carrying the exact words it came from and how sure the
 * model is — and nothing is saved until she taps "Add this" on a candidate.
 * Accepting one folds it into the SAME local answer a pill tap or a typed
 * note would, so it reaches the class row through the one existing save
 * path (`setWorld`) rather than a second one. The chat is a faster way IN to
 * the same three columns, never a different destination for the data.
 *
 * PLAIN, AND THE CAMERA FIRST (#751). The first real teacher session
 * (first real teacher session, 2026-08-31, `docs/research/real-sessions/`) read this
 * surface as "too clunky, the language is so poetic un understandable".
 * #654 had already elevated it — one question per screen, a stagger, a
 * tutorial beat — and she still bounced, because #654 changed the RHYTHM of
 * the questions and left their WORDS alone: a heading like "The things a map
 * cannot see" is a metaphor where a teacher standing in a field needs an
 * instruction. So every heading here is now a plain instruction or a plain
 * question, and every helper line says what we do with the answer, in words
 * a teacher would use to another teacher.
 *
 * The camera leads. Johan, same session: "more importance on photos etc." The
 * photograph was a second-class control below the textarea, wearing the same
 * quiet underline as "Add"; it is now the first thing on the step, and typing
 * is the alternative offered under it. The privacy contract is unchanged —
 * downscaled on the device, read once, kept nowhere — and its sentence still
 * sits under the button that takes the photo.
 */

/**
 * The four questions this component asks, addressable one at a time (#654).
 * `/world` renders them all, as ever. Onboarding renders one per sub-step so
 * each question gets the screen to itself — the walk is the host's; the
 * questions, their copy and their save paths stay here, written once.
 */
export type WorldSection = "chat" | "features" | "species" | "reach";

export interface WorldBuilderProps {
  /** What she has already said. Empty on a first run. */
  features: string[];
  notes: string[];
  reach: string | null;
  /**
   * Render just this one question (#654). Undefined renders all four in the
   * standing order, which is what /world wants and what this component always
   * did. A host stepping through them mounts one instance per step; state
   * survives the walk because every change is announced through `onChange`
   * and the next mount is seeded from the host's draft.
   */
  only?: WorldSection;
  /**
   * The class this answer belongs to, so an accepted or rejected chat
   * candidate can be written to the provenance ledger
   * (`app/worldChatActions.ts`). The chat still works without it — she can
   * still fold a candidate into her local answer — it just cannot be
   * traced back to its source afterwards, so callers that have a class id
   * by the time this renders should always pass it.
   */
  classId?: string;
  /**
   * Called with the whole answer when she commits. Omit it to run headless: no
   * action row renders and the caller drives saving from its own control.
   *
   * That is how onboarding uses it. #232's whole complaint is that preparing a
   * lesson is "next next next", and answering it by adding two more screens to
   * the flow would be the same mistake one surface over. So onboarding embeds
   * this inside a screen it already had, and its own foot button commits
   * everything at once.
   */
  onSave?: (next: WorldAnswer) => void;
  /** Fires on every change, for a caller holding the answer in its own draft. */
  onChange?: (next: WorldAnswer) => void;
  /** Wording for the commit control. Ignored when running headless. */
  saveLabel?: string;
  /** The reader's English for every label here (#872). */
  locale?: Locale;
  saving?: boolean;
  /** Onboarding lets her move on without answering; settings has nothing to skip. */
  onSkip?: () => void;
}

export interface WorldAnswer {
  features: string[];
  notes: string[];
  reach: string | null;
}

/** Chat extraction states: nothing tried yet, the model call in flight, a
 * read with candidates, a read that caught nothing, or a failed read. */
type ChatState = "idle" | "thinking" | "ready" | "empty" | "error";

export function WorldBuilder({
  features: initialFeatures,
  notes: initialNotes,
  reach: initialReach,
  classId,
  only,
  onSave,
  onChange,
  saveLabel,
  locale = "uk",
  saving = false,
  onSkip,
}: WorldBuilderProps) {
  const t = (text: string) => localizeText(text, locale);
  /** Does this section render on this mount? All of them when `only` is unset. */
  const show = (section: WorldSection) => only === undefined || only === section;
  const [features, setFeatures] = useState<string[]>(initialFeatures);
  const [notes, setNotes] = useState<string[]>(initialNotes);
  const [reach, setReach] = useState<string | null>(initialReach);
  const [draft, setDraft] = useState("");

  const [chatText, setChatText] = useState("");
  const [chatState, setChatState] = useState<ChatState>("idle");
  const [candidates, setCandidates] = useState<WorldFactCandidate[]>([]);

  // The species question (#377): same route, same candidate list, its own box.
  const [speciesText, setSpeciesText] = useState("");
  // Which box asked last, so the read-back renders beside the box she used
  // rather than a screen away from her thumb.
  const [askOrigin, setAskOrigin] = useState<"grounds" | "species">("grounds");
  // The photograph (#377): one tap, downscaled on-device, never stored.
  const [photoState, setPhotoState] = useState<"idle" | "reading" | "empty" | "person" | "error">(
    "idle"
  );
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  /** Keep a headless caller's draft in step without it re-rendering us. */
  function announce(next: Partial<WorldAnswer>) {
    onChange?.({ features, notes, reach, ...next });
  }

  /** Merge new candidates in without duplicating one already on the list. */
  function mergeCandidates(incoming: WorldFactCandidate[]) {
    setCandidates((current) => {
      const next = [...current];
      for (const candidate of incoming) {
        if (next.some((c) => c.kind === candidate.kind && c.value === candidate.value)) continue;
        next.push(candidate);
      }
      return next;
    });
  }

  async function askAssistant(rawText?: string) {
    const text = (rawText ?? chatText).trim();
    if (!text || chatState === "thinking") return;
    setAskOrigin(rawText === undefined ? "grounds" : "species");
    setChatState("thinking");
    setCandidates([]);
    try {
      const res = await fetch("/api/world-intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("bad");
      const data = (await res.json()) as {
        available: boolean;
        draft: { candidates: WorldFactCandidate[] } | null;
      };
      if (!data.available || !data.draft) {
        setChatState("error");
        return;
      }
      setCandidates(data.draft.candidates);
      setChatState(data.draft.candidates.length > 0 ? "ready" : "empty");
    } catch {
      setChatState("error");
    }
  }

  function removeCandidate(target: WorldFactCandidate) {
    setCandidates((current) => current.filter((c) => c !== target));
  }

  /**
   * The photograph path (#377). Downscaled on-device to 512px JPEG before it
   * leaves the phone — the upload is the latency, not the model — and sent to
   * a route that reads it, drafts candidates, and keeps nothing. A person in
   * frame refuses the whole read; the message below the button says so.
   */
  async function readPhoto(file: File) {
    setAskOrigin("grounds");
    setPhotoState("reading");
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no-canvas");
      context.drawImage(bitmap, 0, 0, width, height);
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
      if (!base64) throw new Error("no-image");

      const res = await fetch("/api/world-photo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaType: "image/jpeg", image: base64 }),
      });
      if (!res.ok) throw new Error("bad");
      const data = (await res.json()) as {
        available: boolean;
        draft: { candidates: WorldFactCandidate[]; personSeen: boolean } | null;
      };
      if (!data.available || !data.draft) {
        setPhotoState("error");
        return;
      }
      if (data.draft.personSeen) {
        setPhotoState("person");
        return;
      }
      mergeCandidates(data.draft.candidates);
      setPhotoState(data.draft.candidates.length > 0 ? "idle" : "empty");
    } catch {
      setPhotoState("error");
    }
  }

  /** Fire-and-forget: the ledger watches this flow, it never blocks it. */
  function recordDecision(candidate: WorldFactCandidate, status: "confirmed" | "rejected") {
    if (!classId) return;
    void recordWorldFactDecisions(classId, [
      {
        kind: candidate.kind,
        value: candidate.value,
        quote: candidate.quote,
        confidence: candidate.confidence,
        status,
        // A photo candidate carries the photo quote and nothing else can, so
        // the quote IS the origin: her camera, not her sentence.
        provenance:
          candidate.quote === PHOTO_QUOTE ? "teacher-photographed" : "teacher-stated",
      },
    ]).catch(() => {});
  }

  /** Fold an accepted candidate into the SAME local answer a pill or the
   * typed-note box would produce, so it saves through the one existing path. */
  function acceptCandidate(candidate: WorldFactCandidate) {
    if (candidate.kind === "feature") {
      if (!features.includes(candidate.value)) {
        const next = [...features, candidate.value];
        setFeatures(next);
        announce({ features: next });
      }
    } else if (candidate.kind === "reach") {
      setReach(candidate.value);
      announce({ reach: candidate.value });
    } else if (!notes.includes(candidate.value) && notes.length < 6) {
      const next = [...notes, candidate.value];
      setNotes(next);
      announce({ notes: next });
    }
    recordDecision(candidate, "confirmed");
    removeCandidate(candidate);
  }

  function rejectCandidate(candidate: WorldFactCandidate) {
    recordDecision(candidate, "rejected");
    removeCandidate(candidate);
  }

  function confidenceWord(confidence: number): string {
    if (confidence >= 0.75) return "we're fairly sure";
    if (confidence >= 0.4) return "we think so";
    return "we're not sure";
  }

  function candidateLabel(candidate: WorldFactCandidate): string {
    if (candidate.kind !== "reach") return candidate.value;
    return REACH_OPTIONS.find((r) => r.id === candidate.value)?.label ?? candidate.value;
  }

  function toggleFeature(value: string) {
    const next = features.includes(value)
      ? features.filter((f) => f !== value)
      : [...features, value];
    setFeatures(next);
    announce({ features: next });
  }

  function addNote() {
    const text = draft.trim();
    // Bounded to match the server schema exactly. A note that would be rejected
    // there must never look accepted here.
    if (!text || text.length > 120 || notes.length >= 6) return;
    if (/[<>]/.test(text) || /https?:\/\//i.test(text)) return;
    const next = [...notes, text];
    setNotes(next);
    setDraft("");
    announce({ notes: next });
  }

  /** The read-back: notices and candidates, rendered beside the box that
   * asked so the answer lands under her thumb, not a screen away. */
  const readBack = (
    <>
      {chatState === "error" && (
        <p className={styles.chatNote} role="alert">
          We couldn&rsquo;t read that just now. Try again, or write it in your
          own words.
        </p>
      )}

      {chatState === "empty" && (
        <p className={styles.chatNote}>
          We didn&rsquo;t find anything to add from that. Try naming one thing
          you can point at, like a pond or a big tree.
        </p>
      )}

      {candidates.length > 0 && (
        <ul className={styles.candidates} aria-label="What we found">
          {candidates.map((candidate, index) => (
            <li
              key={`${candidate.kind}-${candidate.value}`}
              className={styles.candidate}
              // The stagger is the listening beat (#654): her words come back
              // one at a time, each carrying the phrase it came from, so she
              // reads them rather than meets a list.
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <div>
                <p className={styles.candidateValue}>{candidateLabel(candidate)}</p>
                <p className={styles.candidateQuote}>
                  {candidate.quote === PHOTO_QUOTE ? (
                    <>from your photo</>
                  ) : (
                    <>&ldquo;{candidate.quote}&rdquo;</>
                  )}{" "}
                  &middot; {confidenceWord(candidate.confidence)}
                </p>
              </div>
              <div className={styles.candidateActions}>
                <button type="button" onClick={() => acceptCandidate(candidate)}>
                  Add this
                </button>
                <button type="button" onClick={() => rejectCandidate(candidate)}>
                  Not this
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div className={only ? `${styles.world} ${styles.solo}` : styles.world}>
      {show("chat") && (
      <section className={`${styles.zoom} ${styles.chat}`}>
        <p className={styles.eyebrow}>{t("a photo of your grounds")}</p>
        <h2 className={styles.head}>{t("Take a photo of your grounds")}</h2>
        <p className={styles.said}>
          A photo is the quickest way to do this. We read it, list what we can
          see, and save nothing until you keep it.
        </p>

        {/* The photograph leads (#751). One tap: no picker ceremony, no
            confirm-the-photo step. Downscaled on the device, read once, kept
            nowhere (#377) — and that sentence stays under the button that
            takes it, where a teacher deciding whether to press it can read it. */}
        <div className={styles.photoLead}>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void readPhoto(file);
            }}
          />
          <button
            type="button"
            className={styles.photoButton}
            disabled={photoState === "reading"}
            onClick={() => photoInputRef.current?.click()}
          >
            {photoState === "reading" ? "Reading your photo…" : "Take a photo"}
          </button>
          <p className={styles.chatNote}>
            {t("Point the camera at the plants or the corner of your grounds, not at a person. The photo is read once and never saved.")}
          </p>
        </div>

        {photoState === "person" && (
          <p className={styles.chatNote} role="alert">
            {t("Someone was in that photo, so we didn’t read it and nothing was kept. Take it again with only the grounds in frame.")}
          </p>
        )}
        {photoState === "empty" && (
          <p className={styles.chatNote}>
            We couldn&rsquo;t make anything out in that photo. Closer, in good
            light, usually works better.
          </p>
        )}
        {photoState === "error" && (
          <p className={styles.chatNote} role="alert">
            We couldn&rsquo;t read that photo just now. Take it again, or type
            it instead.
          </p>
        )}

        <div className={styles.orType}>
          <label className={styles.orTypeLabel} htmlFor="world-describe">
            Or type it instead
          </label>
          <div className={styles.chatRow}>
            <textarea
              id="world-describe"
              className={styles.chatInput}
              value={chatText}
              maxLength={MAX_INPUT_LEN}
              rows={3}
              placeholder="We have a pond in the corner, and a patch behind the shed where the nettles grow"
              onChange={(e) => setChatText(e.target.value)}
            />
            <button
              type="button"
              className={styles.chatSend}
              disabled={!chatText.trim() || chatState === "thinking"}
              onClick={() => void askAssistant()}
            >
              {chatState === "thinking" ? "Reading…" : "Read this"}
            </button>
          </div>
        </div>

        {askOrigin === "grounds" && readBack}
      </section>
      )}

      {show("features") && (
      <section className={styles.zoom}>
        <p className={styles.eyebrow}>{t("what is in your grounds")}</p>
        <h2 className={styles.head}>{t("Tick what your grounds have")}</h2>
        {/* What this line may claim, walked rather than assumed (#777).
            `siteFeatures` reaches exactly one place: `habitatsFromFeatures`
            (lib/look-for.ts:56) inside `reachableHabitatsFor`
            (lib/place-context.ts:204), which becomes `place.lookFor.reachable`
            and then `reachableTags` in app/run/page.tsx:68,
            app/session/lesson-data.ts:59 and lib/offline/prepare-server.ts:81.
            There it narrows the `getOutsideNow` look-fors, narrows
            `hazardsForClass`, and is handed to `adaptSessionForPlace` as
            context for the place instruction. Every one of those is a change
            INSIDE a lesson. Which lesson she gets is the `stop` projection in
            app/page.tsx:194-201 — `nextUnled` over `curriculumSequence()`,
            curriculum position and nothing else, which these ticks never
            touch. `shelfForPlace` does narrow a shelf, but by bioregion pack,
            and its own doc-comment says it is a no-op today. So the line says
            fit, and names the two things that actually move. */}
        <p className={styles.said}>
          {t("Tick anything you can walk a class to. We use it to fit each lesson to your grounds: what we ask your class to look for, and what we warn you about.")}
        </p>

        <div className={styles.opts} role="group" aria-label={t("What is in your grounds")}>
          {SITE_FEATURES.map((feature) => (
            <button
              key={feature}
              type="button"
              className={features.includes(feature) ? `${styles.opt} ${styles.on}` : styles.opt}
              aria-pressed={features.includes(feature)}
              onClick={() => toggleFeature(feature)}
            >
              {feature}
            </button>
          ))}
        </div>

        {/*
          Her own words. Our vocabulary is eleven items and a schoolyard is not,
          so "the bit behind the bike sheds where the nettles are" needs
          somewhere to live that is not a checkbox we failed to write.
        */}
        <div className={styles.notes}>
          <label htmlFor="world-note">{t("Anything else in your grounds?")}</label>
          <div className={styles.noterow}>
            <input
              id="world-note"
              value={draft}
              maxLength={120}
              placeholder="in your own words"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNote();
                }
              }}
            />
            <button type="button" onClick={addNote} disabled={!draft.trim() || notes.length >= 6}>
              Add
            </button>
          </div>
          {notes.length > 0 && (
            <ul className={styles.notelist}>
              {notes.map((note, i) => (
                <li key={`${note}-${i}`}>
                  <span>{note}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${note}`}
                    onClick={() => {
                      const next = notes.filter((_, j) => j !== i);
                      setNotes(next);
                      announce({ notes: next });
                    }}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      )}

      {/* The species question (#377), in the same eyebrow-head-said pattern as
          every other zoom. Her answer rides the same intake route and the same
          confirm-or-reject list — her words, teacher-stated, no record gate:
          she knows her own grounds better than the record does. */}
      {show("species") && (
      <section className={styles.zoom}>
        <p className={styles.eyebrow}>plants and animals you know</p>
        <h2 className={styles.head}>Name any plants or animals you know here</h2>
        <p className={styles.said}>
          Nettles by the gate, a horse chestnut, frogs in spring. Anything you
          can name is saved with your class, so it is there when you plan a
          lesson.
        </p>
        <div className={styles.chatRow}>
          <textarea
            className={styles.chatInput}
            value={speciesText}
            maxLength={MAX_INPUT_LEN}
            rows={2}
            placeholder="There are nettles behind the shed, and a big oak by the fence"
            aria-label={t("Plants or animals in your grounds")}
            onChange={(e) => setSpeciesText(e.target.value)}
          />
          <button
            type="button"
            className={styles.chatSend}
            disabled={!speciesText.trim() || chatState === "thinking"}
            onClick={() => void askAssistant(speciesText)}
          >
            {chatState === "thinking" ? "Reading…" : "Read this"}
          </button>
        </div>
        {askOrigin === "species" && readBack}
      </section>
      )}

      {show("reach") && (
      <section className={styles.zoom}>
        <p className={styles.eyebrow}>how far you can go</p>
        <h2 className={styles.head}>How far can you take a class?</h2>
        {/* What this line may claim, walked rather than assumed (#849).
            `Class.reach` is stored (app/start/actions.ts:258) and read off
            the column in exactly one place, to refill this form
            (app/world/page.tsx:52). The onboarding mount of the same form
            (app/start/StartFlow.tsx:1012) seeds it from the in-session draft
            rather than the column, and a resume resets that draft to
            EMPTY_WORLD (:158), so the stored answer is never re-read there.
            Nothing reads it to change a lesson, so the copy tells her how to
            answer and promises nothing. Its neighbours are not choosers
            either, but they do not travel the same distance, so scope the
            claim to the input. `siteFeatures` reaches exactly one place,
            `habitatsFromFeatures` inside `reachableHabitatsFor`
            (lib/place-context.ts:214), which shapes the lesson's look-fors
            and hazards. `grounds` goes that way too (:213) and three ways
            more: `todayQuery.habitats` (app/page.tsx:213, 243), which filters
            the Outside-now read; `getSpeciesDepth` (lib/cast/depth.ts:186),
            which narrows the phenology behind a species panel; and
            /api/outside (app/api/outside/route.ts:63) for the onboarding
            preview. Every one of those shapes what is INSIDE a lesson, or
            what a read shows. None picks the lesson: that is `nextUnled` over
            `curriculumSequence()` (app/page.tsx:194-201), and
            `curriculumSequence()` takes no arguments, so no answer on this
            screen can reach it. The one function that narrows a shelf is
            `shelfForPlace` (lib/place-context.ts:162), by bioregion pack, and
            its own doc-comment records it as a no-op today. */}
        <p className={styles.said}>
          Pick the furthest you can go on a normal week, not the once-a-year
          trip.
        </p>

        <div className={styles.opts} role="group" aria-label="How far a class can go">
          {REACH_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={reach === option.id ? `${styles.opt} ${styles.on}` : styles.opt}
              aria-pressed={reach === option.id}
              // Tapping the chosen one again clears it. There is no "not sure"
              // option because an unanswered question is not the same as an
              // answer, and inventing a default here would decide what lessons
              // she is offered on her behalf.
              onClick={() => {
                const next = reach === option.id ? null : option.id;
                setReach(next);
                announce({ reach: next });
              }}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      </section>
      )}

      {onSave && (
        <div className={styles.actions}>
          <button
            type="button"
            className="btn-start"
            disabled={saving}
            onClick={() => onSave({ features, notes, reach })}
          >
            {saving ? "Saving" : (saveLabel ?? "Save")}
          </button>
          {onSkip && (
            <button type="button" className={styles.skip} onClick={onSkip}>
              Skip for now
            </button>
          )}
        </div>
      )}
    </div>
  );
}
