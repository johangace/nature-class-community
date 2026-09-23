import type { BioregionPack, ExpectedSilence } from "@/schema/bioregion";

/**
 * Expected silence, and the two render paths that must never become one.
 *
 * ── THE BUG THIS TYPE EXISTS TO MAKE UNSPELLABLE ────────────────────────────
 *
 * "Checked, no hazard" and "could not check" are DIFFERENT FACTS, and the
 * obvious shape for both is a nullable string: a safety line when there is
 * something to say, null when there is not. That shape is the bug. It throws
 * away which kind of nothing this is at the moment it is created, and no
 * amount of care downstream gets it back, because the information is gone.
 *
 * A teacher reading a safety card with nothing on it concludes the grounds
 * were checked and are fine. If the truth is that nothing could be checked,
 * the product has told them something false by staying quiet — and staying
 * quiet is normally our most honest move, which is exactly what makes this
 * one dangerous.
 *
 * So the check result is a DISCRIMINATED UNION and never a nullable string.
 * Not by convention, not by a rule in a comment: structurally, so that a
 * caller cannot silently drop the distinction and a future refactor cannot
 * flatten it without the type system objecting.
 *
 * ── THE VISUAL IS DELIBERATELY NOT HERE ─────────────────────────────────────
 *
 * office#330 §6 specifies that the could-not-check state renders at caution
 * weight and colour, never a grey line. That visual is NOT built here, and
 * that is a scoping decision rather than an omission: the lesson surfaces this
 * would land on are being rewritten under #242 (#231, #232), and a treatment
 * built tonight would be deleted next week.
 *
 * So this ships SILENCE for the visual, exactly as lib/cast/closing.ts ships
 * silence for the absence line, and for the same reason: the wiring is the
 * hard part and the sentence is the easy part. Both paths currently render
 * nothing. They are still two paths, and that is the whole point of the
 * ticket — when the rework lands a caution treatment, it attaches to the
 * `absence` path alone and the `clear` path is untouched.
 *
 * ── WHAT THIS UNBLOCKS ──────────────────────────────────────────────────────
 *
 * The missing resolver token. lib/cast/closing.ts is gated shut because
 * nothing distinguishes "expected here and not found" from "the read was
 * thin". A pack's `expectedSilence` declaration IS that distinction for the
 * signals it covers: a pack that has written down what it cannot say about
 * this place has made a checkable claim, and `expectedSilenceFor` returns it.
 * That is the difference between a silence we can speak about and one we
 * cannot, and it is why the Phoenix-August line has had nowhere to come from.
 */

/**
 * The outcome of asking a place about one signal. Four states, and every one
 * of them is a different thing to have found out.
 */
export type SignalCheck =
  /** We looked and there is something to say. The only state with content. */
  | { state: "reported"; signalId: string; detail: string }
  /** We looked and there was nothing. A real, positive finding. */
  | { state: "checked-clear"; signalId: string }
  /**
   * This place has DECLARED it has nothing to say here, and why. Not a gap:
   * a written-down claim about the place, and the resolver token an honest
   * absence line can finally be built on.
   */
  | { state: "expected-silence"; signalId: string; reason: string; degradeTo: string | null }
  /**
   * No reading, and nobody declared why. The state that must never be dressed
   * up as `checked-clear`. We do not know, and we do not know why we do not
   * know.
   */
  | { state: "unchecked"; signalId: string };

/** The pack's declaration for one signal, or null when it made none. */
export function expectedSilenceFor(
  pack: BioregionPack | null,
  signalId: string
): ExpectedSilence | null {
  if (!pack) return null;
  return pack.expectedSilence.find((entry) => entry.signalId === signalId) ?? null;
}

/**
 * Resolve one signal for one place.
 *
 * `reading` is what the sensing layer returned: a string when there is
 * something to report, null when it returned nothing, and `undefined` when it
 * was never asked or could not answer. Those last two are different, which is
 * the whole reason this function has four outcomes and not two.
 */
export function checkSignal(
  signalId: string,
  reading: string | null | undefined,
  pack: BioregionPack | null
): SignalCheck {
  if (typeof reading === "string" && reading.length > 0) {
    return { state: "reported", signalId, detail: reading };
  }
  // A null reading is an ANSWER: we asked, the place had nothing. That is a
  // finding, and it is the only thing that may ever render as reassurance.
  if (reading === null) return { state: "checked-clear", signalId };

  const declared = expectedSilenceFor(pack, signalId);
  if (declared) {
    return {
      state: "expected-silence",
      signalId,
      reason: declared.reason,
      degradeTo: declared.degradeTo ?? null,
    };
  }
  return { state: "unchecked", signalId };
}

// ---------------------------------------------------------------------------
// The two render paths
// ---------------------------------------------------------------------------

/**
 * Which path a check renders down. THREE values, not a boolean and not a
 * nullable string:
 *
 *   report    there is something to say. Say it.
 *   clear     we checked and it is fine. May read as reassurance.
 *   absence   we could not check. MUST NOT read as reassurance. office#330 §6
 *             gives this caution weight and colour; today it is silent, and
 *             it is silent on its OWN path so the treatment has somewhere to
 *             attach when the rework lands.
 */
export type RenderPath = "report" | "clear" | "absence";

export function renderPathFor(check: SignalCheck): RenderPath {
  switch (check.state) {
    case "reported":
      return "report";
    case "checked-clear":
      return "clear";
    // Both kinds of not-knowing take the absence path. They stay distinguishable
    // in the check itself — a declared silence can be spoken about and an
    // unchecked one cannot — but neither may ever be shown as reassurance.
    case "expected-silence":
    case "unchecked":
      return "absence";
  }
}

/** What a surface actually shows, and by which path it got there. */
export interface RenderedSignal {
  path: RenderPath;
  /** The line to show, or null for silence. Never the only thing a caller reads. */
  text: string | null;
}

/**
 * The render decision.
 *
 * `clear` and `absence` BOTH return null text today, and that coincidence is
 * precisely why `path` travels beside it. A caller that reads only `text`
 * cannot tell them apart — which is the original bug — so the shape hands it
 * `path` whether it wants it or not.
 *
 * TO OPEN THE ABSENCE VISUAL, when #242's surfaces have settled: give the
 * `absence` branch below a line, and give the surface a caution treatment
 * keyed on `path === "absence"`. Nothing else changes; every caller already
 * handles a null text and already receives the path.
 *
 * The line, when it is written, obeys the same two rules the closing absence
 * line does: it may only speak where the pack DECLARED its silence (the
 * `expected-silence` state, never `unchecked`), and it stays a statement about
 * what we do not know rather than a claim about the place.
 */
export function renderSignal(check: SignalCheck): RenderedSignal {
  const path = renderPathFor(check);
  if (check.state === "reported") return { path, text: check.detail };
  // Silence, on two separate paths. See the header: the visual belongs to
  // whatever the #242 rework lands, and a treatment built ahead of it would
  // only be deleted.
  return { path, text: null };
}

/**
 * True when this silence is one we could honestly speak about — the pack wrote
 * down that it has nothing to say here, and why.
 *
 * This is the token lib/cast/closing.ts has been waiting for. It does not open
 * that gate on its own (that surface is a founder call and a render decision),
 * but it is the thing that was missing.
 */
export function isSpeakableSilence(check: SignalCheck): boolean {
  return check.state === "expected-silence";
}
