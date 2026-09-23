import { describe, expect, it } from "vitest";
import {
  checkSignal,
  expectedSilenceFor,
  isSpeakableSilence,
  renderPathFor,
  renderSignal,
  type SignalCheck,
} from "@/lib/expected-silence";
import { bioregionPackSchema, emptyBioregionPack, type BioregionPack } from "@/schema/bioregion";

/**
 * The two-render-paths guard (#208).
 *
 * The bug under test is one a nullable string CANNOT be defended against:
 * "checked, no hazard" and "could not check" both render nothing today, so a
 * `string | null` makes them the same value, and a teacher reading a blank
 * safety card concludes the grounds were checked. Staying quiet is normally
 * the most honest thing this product does, which is exactly what makes this
 * one dangerous.
 *
 * So the fixtures below assert on the PATH, not on the text — because the text
 * is identical for both states and always will be until #242's surfaces settle
 * and the absence path gets its caution treatment. A guard that asserted on
 * text alone would pass on the broken shape, which is the whole failure being
 * prevented.
 */

/** Phoenix in August: nothing here turns colour, and the pack says so. */
const PHOENIX_AUGUST: BioregionPack = bioregionPackSchema.parse({
  key: { resolution: "koppen", value: "arid", resolvedBy: "pack-key@test" },
  expectedSilence: [
    {
      signalId: "autumn-colour",
      reason: "No deciduous canopy in this pack, so there is no colour change to report",
      degradeTo: "monsoon-green-up",
    },
  ],
});

const WAVE_ONE = emptyBioregionPack({
  resolution: "global",
  value: "global",
  resolvedBy: "pack-key@test",
});

describe("the four states stay four", () => {
  it("reports a reading", () => {
    const check = checkSignal("heat-index", "41", PHOENIX_AUGUST);
    expect(check.state).toBe("reported");
  });

  it("calls a null reading checked-clear — an answer, not an absence", () => {
    // We asked and the place had nothing. That is a finding, and it is the
    // only state that may ever render as reassurance.
    expect(checkSignal("hazard", null, PHOENIX_AUGUST).state).toBe("checked-clear");
  });

  it("calls a declared gap expected-silence, with its reason and token", () => {
    const check = checkSignal("autumn-colour", undefined, PHOENIX_AUGUST);
    expect(check.state).toBe("expected-silence");
    if (check.state !== "expected-silence") throw new Error("unreachable");
    expect(check.reason).toContain("deciduous");
    expect(check.degradeTo).toBe("monsoon-green-up");
  });

  it("calls an undeclared gap unchecked, never checked-clear", () => {
    // THE LOAD-BEARING ASSERTION. If this ever returns checked-clear, the
    // product tells a teacher the grounds were checked when nothing was.
    const check = checkSignal("water-hazard", undefined, PHOENIX_AUGUST);
    expect(check.state).toBe("unchecked");
    expect(check.state).not.toBe("checked-clear");
  });

  it("treats a wave-1 pack's empty declaration as unchecked, not as clear", () => {
    // Every real pack today is this one. An empty expectedSilence list means
    // nobody wrote anything down, which is not the same as nothing being there.
    expect(checkSignal("autumn-colour", undefined, WAVE_ONE).state).toBe("unchecked");
  });

  it("treats a missing pack as unchecked", () => {
    expect(checkSignal("autumn-colour", undefined, null).state).toBe("unchecked");
  });
});

describe("checked-clear and could-not-check are two render paths", () => {
  const clear = checkSignal("hazard", null, PHOENIX_AUGUST);
  const declared = checkSignal("autumn-colour", undefined, PHOENIX_AUGUST);
  const unknown = checkSignal("water-hazard", undefined, PHOENIX_AUGUST);

  it("renders both as silence today — and this is why text alone is not enough", () => {
    expect(renderSignal(clear).text).toBeNull();
    expect(renderSignal(declared).text).toBeNull();
    expect(renderSignal(unknown).text).toBeNull();
  });

  it("but sends them down different paths", () => {
    // THE POINT OF THE TICKET. Identical text, different path. When the #242
    // rework lands a caution treatment it attaches to `absence` alone, and the
    // `clear` path is untouched.
    expect(renderSignal(clear).path).toBe("clear");
    expect(renderSignal(declared).path).toBe("absence");
    expect(renderSignal(unknown).path).toBe("absence");
    expect(renderSignal(clear).path).not.toBe(renderSignal(declared).path);
  });

  it("never lets a could-not-check take the clear path", () => {
    const notClear: SignalCheck[] = [declared, unknown];
    for (const check of notClear) {
      expect(renderPathFor(check), check.state).not.toBe("clear");
    }
  });

  it("puts the only state with content on the report path", () => {
    const reported = checkSignal("heat-index", "41", PHOENIX_AUGUST);
    expect(renderSignal(reported)).toEqual({ path: "report", text: "41" });
  });
});

describe("the resolver token the absence line was missing", () => {
  it("is true only for a silence the pack actually declared", () => {
    // lib/cast/closing.ts is gated because nothing distinguished "expected here
    // and not found" from "the read was thin". This is that distinction.
    expect(isSpeakableSilence(checkSignal("autumn-colour", undefined, PHOENIX_AUGUST))).toBe(true);
    expect(isSpeakableSilence(checkSignal("water-hazard", undefined, PHOENIX_AUGUST))).toBe(false);
    expect(isSpeakableSilence(checkSignal("hazard", null, PHOENIX_AUGUST))).toBe(false);
  });

  it("carries what to say instead, when the pack named one", () => {
    // Phoenix in August has no autumn colour and the pack says what stands in
    // its place. Nothing renders this yet; the token exists so something can.
    const declared = expectedSilenceFor(PHOENIX_AUGUST, "autumn-colour");
    expect(declared?.degradeTo).toBe("monsoon-green-up");
  });

  it("is false for every signal in wave 1, because nothing is declared yet", () => {
    // Honest state of the product: the type is ready, the data is not. The
    // declarations arrive in #209-#215.
    expect(WAVE_ONE.expectedSilence).toEqual([]);
    expect(isSpeakableSilence(checkSignal("autumn-colour", undefined, WAVE_ONE))).toBe(false);
  });
});
