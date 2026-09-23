import { describe, expect, it } from "vitest";
import {
  JOIN_PREFILL_TTL_MS,
  type PrefillStore,
  rememberJoinSchool,
  takeJoinSchool,
} from "@/lib/join-prefill";

/**
 * Carrying the school's name from /join into onboarding (#529).
 *
 * The store is the whole mechanism, and the two things it must get right are
 * opposites: the name has to survive a walk to an email inbox and back, and it
 * must not still be lying around for the next teacher who picks up the
 * staffroom iPad.
 */

const NOW = 1_700_000_000_000;

function fakeStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  } satisfies PrefillStore & { data: Map<string, string> };
}

/** A store that refuses everything, as Safari private browsing once did. */
const hostileStore: PrefillStore = {
  getItem() {
    throw new Error("site data blocked");
  },
  setItem() {
    throw new Error("site data blocked");
  },
  removeItem() {
    throw new Error("site data blocked");
  },
};

describe("the round trip", () => {
  it("gives back the name the join link carried", () => {
    const store = fakeStore();
    rememberJoinSchool("Oakfield Primary School", NOW, store);

    expect(takeJoinSchool(NOW + 1000, store)).toBe("Oakfield Primary School");
  });

  it("survives the walk to the inbox and back", () => {
    const store = fakeStore();
    rememberJoinSchool("Oakfield Primary School", NOW, store);

    // Twenty minutes later, in a tab that did not exist when the link was
    // opened. This is why the store is not sessionStorage.
    expect(takeJoinSchool(NOW + 20 * 60 * 1000, store)).toBe("Oakfield Primary School");
  });
});

describe("it is taken, not read", () => {
  it("is gone the second time, so the next teacher gets an empty field", () => {
    const store = fakeStore();
    rememberJoinSchool("Oakfield Primary School", NOW, store);

    expect(takeJoinSchool(NOW, store)).toBe("Oakfield Primary School");
    expect(takeJoinSchool(NOW, store)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("expires rather than waiting all afternoon", () => {
    const store = fakeStore();
    rememberJoinSchool("Oakfield Primary School", NOW, store);

    expect(takeJoinSchool(NOW + JOIN_PREFILL_TTL_MS + 1, store)).toBeNull();
  });

  it("refuses an entry stamped in the future, which means a moved clock", () => {
    const store = fakeStore();
    rememberJoinSchool("Oakfield Primary School", NOW, store);

    expect(takeJoinSchool(NOW - 60_000, store)).toBeNull();
  });
});

describe("what it will not carry", () => {
  it("stores nothing for a name that is not a name", () => {
    const store = fakeStore();
    rememberJoinSchool("   ", NOW, store);
    rememberJoinSchool("", NOW, store);

    expect(store.data.size).toBe(0);
    expect(takeJoinSchool(NOW, store)).toBeNull();
  });

  it("sanitises on the way in", () => {
    const store = fakeStore();
    rememberJoinSchool("<b>Oakfield</b>", NOW, store);

    expect(takeJoinSchool(NOW, store)).toBe("b Oakfield /b");
  });

  it("sanitises on the way out, because storage is whatever the origin wrote", () => {
    // Not written by us: another page, an extension, a console. The field it
    // lands in is read by a server action, so it is checked again here.
    const store = fakeStore({
      "nature-class.join.school": JSON.stringify({
        school: `<script>x</script>${"y".repeat(5000)}`,
        at: NOW,
      }),
    });

    const taken = takeJoinSchool(NOW, store);
    expect(taken).not.toBeNull();
    expect(taken!).not.toContain("<");
    expect(taken!.length).toBeLessThanOrEqual(81);
  });

  it("shrugs off junk in the slot", () => {
    expect(takeJoinSchool(NOW, fakeStore({ "nature-class.join.school": "not json" }))).toBeNull();
    expect(takeJoinSchool(NOW, fakeStore({ "nature-class.join.school": "null" }))).toBeNull();
    expect(
      takeJoinSchool(NOW, fakeStore({ "nature-class.join.school": '{"school":"Oakfield"}' }))
    ).toBeNull();
    expect(
      takeJoinSchool(NOW, fakeStore({ "nature-class.join.school": '{"school":7,"at":1}' }))
    ).toBeNull();
  });
});

describe("when the browser will not play", () => {
  it("stays quiet instead of throwing at a teacher", () => {
    expect(() => rememberJoinSchool("Oakfield", NOW, hostileStore)).not.toThrow();
    expect(takeJoinSchool(NOW, hostileStore)).toBeNull();
    expect(takeJoinSchool(NOW, null)).toBeNull();
    expect(() => rememberJoinSchool("Oakfield", NOW, null)).not.toThrow();
  });
});
