import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlacePhotoCache,
  __resetSubjectEntityCache,
  readPlacePhotos,
  readSubjectEntity,
  readSubjectPhotos,
} from "@/lib/outside/place-photos";

/**
 * PHOTOGRAPHS OF THE PLACE, NOT OF A SPECIES.
 *
 * Every image in this product was a species portrait until 2026-08-17, so
 * there was no way to show a wall, a pond, a hedge or the ground underfoot —
 * the exact things the world-building questions ask about. This reads
 * Wikimedia Commons geosearch, which needs no key and already mirrors
 * Geograph Britain and Ireland.
 *
 * The upstream is stubbed and the module's own parsing, ranking, credit rule
 * and cache are the shipping code.
 */

/** One Commons page in the shape the real API returns. */
function page(
  id: number,
  title: string,
  extra: { artist?: string | null; license?: string | null; thumb?: string | null } = {}
) {
  const { artist = '<a href="//commons.wikimedia.org/wiki/User:Someone">Someone</a>', license = "CC BY-SA 2.0", thumb = `https://upload.wikimedia.org/thumb/${id}.jpg` } = extra;
  return {
    pageid: id,
    title,
    imageinfo: [
      {
        ...(thumb ? { thumburl: thumb } : {}),
        descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
        extmetadata: {
          ...(artist ? { Artist: { value: artist } } : {}),
          ...(license ? { LicenseShortName: { value: license } } : {}),
        },
      },
    ],
  };
}

function respondWith(pages: ReturnType<typeof page>[]) {
  const body = { query: { pages: Object.fromEntries(pages.map((p) => [String(p.pageid), p])) } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  );
}

/** Each test gets its own coordinate: the cache is keyed by place and lives on. */
let n = 0;
const somewhere = () => ({ lat: 51.5 + ++n / 1000, lng: -0.1 });

beforeEach(() => {
  __resetPlacePhotoCache();
  __resetSubjectEntityCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  // The deadline specs below spy on `AbortSignal.timeout`, which is a global
  // and would otherwise stay shortened for every spec after them.
  vi.restoreAllMocks();
});

describe("reading photographs of the area", () => {
  it("returns a usable photograph with its credit and licence", async () => {
    respondWith([page(1, "File:Hedgerow near the school.jpg")]);

    const read = await readPlacePhotos(somewhere());

    expect(read.answered).toBe(true);
    expect(read.photos).toHaveLength(1);
    expect(read.photos[0]).toMatchObject({
      title: "Hedgerow near the school",
      url: "https://upload.wikimedia.org/thumb/1.jpg",
      license: "CC BY-SA 2.0",
    });
  });

  it("strips the wiki markup out of a credit, because this prints on paper", async () => {
    // Commons returns `Artist` as rendered HTML. A child's sheet is paper and
    // a teacher's card is type; neither can render an anchor tag.
    respondWith([page(2, "File:Old wall.jpg", { artist: '<a href="/wiki/User:M">Martha K.</a>' })]);

    const read = await readPlacePhotos(somewhere());

    expect(read.photos[0]?.credit).toBe("Martha K.");
    expect(read.photos[0]?.credit).not.toContain("<");
  });

  it("cleans the Geograph suffix off a title rather than showing the file name", async () => {
    respondWith([page(3, "File:Pond on the common - geograph.org.uk - 3627422.jpg")]);

    const read = await readPlacePhotos(somewhere());
    expect(read.photos[0]?.title).toBe("Pond on the common");
  });

  /**
   * THE RANKING IS THE POINT, AND IT IS NOT COSMETIC.
   *
   * Geotagged density in a city is infrastructure. The real read around a
   * north London school returns railway stations before it returns anything
   * green, so a surface that showed the raw order would answer "what does
   * your area look like" with four photographs of a platform.
   */
  it("leads with natural subjects and pushes the built ones behind them", async () => {
    respondWith([
      page(10, "File:Highbury and Islington station platform.jpg"),
      page(11, "File:Bus stop on Holloway Road.jpg"),
      page(12, "File:Oak tree on the green.jpg"),
      page(13, "File:Pond in the park.jpg"),
    ]);

    const read = await readPlacePhotos({ ...somewhere(), limit: 4 });
    const titles = read.photos.map((p) => p.title);

    expect(titles.slice(0, 2)).toEqual(["Oak tree on the green", "Pond in the park"]);
    expect(titles.slice(2)).toContain("Highbury and Islington station platform");
  });

  it("keeps the built ones rather than discarding them", async () => {
    // Ranking, not filtering. The street a class walks down is still their
    // place, and a thin area with only built subjects should still show them.
    respondWith([page(20, "File:Bus stop on Holloway Road.jpg")]);

    const read = await readPlacePhotos(somewhere());
    expect(read.photos).toHaveLength(1);
  });
});

describe("what it refuses, and what it says when it cannot answer", () => {
  it("shows a photograph that arrived with no credit at all", async () => {
    // Johan, 2026-08-17: "all photos no gates! we need any photo we can get".
    // The credit line renders whatever travelled, and nothing when nothing did.
    respondWith([page(30, "File:Uncredited field.jpg", { artist: null })]);

    const read = await readPlacePhotos(somewhere());
    expect(read.answered).toBe(true);
    expect(read.photos).toHaveLength(1);
    expect(read.photos[0]?.credit).toBe("");
  });

  it("records an unstated licence rather than inventing an open one", async () => {
    respondWith([page(31, "File:Meadow.jpg", { license: null })]);

    const read = await readPlacePhotos(somewhere());
    expect(read.photos[0]?.license).toBe("unstated");
  });

  it("says nothing when there is no coordinate", async () => {
    const read = await readPlacePhotos({ lat: null, lng: null });

    // `answered: false` means say nothing. It is not the same as "your area
    // has no photographs", which is a claim about her place.
    expect(read).toEqual({ photos: [], answered: false });
  });

  it("says nothing when the upstream fails, and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));

    const read = await readPlacePhotos(somewhere());
    expect(read).toEqual({ photos: [], answered: false });
  });

  it("distinguishes a read that found nothing from a read that failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ query: {} }), { status: 200 })));

    const read = await readPlacePhotos(somewhere());
    expect(read).toEqual({ photos: [], answered: true });
  });
});

describe("manners toward a free upstream", () => {
  it("asks once for a repeated read of the same place", async () => {
    respondWith([page(40, "File:Wood.jpg")]);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const place = somewhere();

    await readPlacePhotos(place);
    await readPlacePhotos(place);

    // Wikimedia asks nothing of us in return for this data except that we do
    // not hammer it, and two teachers at one school share a coordinate.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("identifies itself and stays inside the geosearch radius ceiling", async () => {
    respondWith([page(41, "File:Heath.jpg")]);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    await readPlacePhotos({ ...somewhere(), radiusM: 999_999 });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain("ggsradius=10000");
    expect((init.headers as Record<string, string>)["user-agent"]).toContain("nature-class");
  });
});

/**
 * A PICTURE OF THE THING, AND NOTHING WHEN THERE ISN'T ONE.
 *
 * This went through two wrong shapes before it was right, and both are worth
 * recording because both looked reasonable.
 *
 * It first preferred a photograph taken near the school, using Commons'
 * `nearcoord:` operator. Asking it the questions a child actually asks showed
 * the nearness was buying wrong answers: `acorn` near a north London school
 * returned an acorn SCULPTURE, then "Acorn Estate, Peckham", then "The Acorn,
 * Haggerston" — a monument, a housing estate and a pub. Nearby search matches
 * places NAMED after a thing. Johan, 2026-08-17: "an acorn doesnt have to be
 * near london.. just acorn is fine..." and "a lot of things dont need a
 * location eg what is lighting? or what i the moon?"
 *
 * It then fell back to a plain keyword search, which is worse in a quieter
 * way: a keyword match always returns its best guess however bad. `conker`
 * returned "Nuri Bey Conker", a Turkish surname. `thunder` returned "Thunder
 * Bay skyline".
 *
 * So: the encyclopaedia's own chosen image, or nothing. The ability to DECLINE
 * is the feature.
 */

/** Wikipedia's answer, then Commons' answer about the file it named. */
function stubCanonical(
  wiki: { pageimage?: string; extract?: string } | null,
  file?: ReturnType<typeof page>
) {
  const wikiBody = { query: { pages: { "1": wiki ?? {} } } };
  const fileBody = file
    ? { query: { pages: { [String(file.pageid)]: file } } }
    : { query: { pages: {} } };
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(call++ === 0 ? wikiBody : fileBody), { status: 200 }))
  );
}

describe("the canonical picture of a subject", () => {
  it("returns the article's own image, with its credit and licence", async () => {
    stubCanonical(
      { pageimage: "Quercus robur acorn.jpg", extract: "The acorn is the nut of the oaks." },
      page(200, "File:Quercus robur acorn.jpg", { artist: "<a href='/x'>Ivar Leidus</a>" })
    );

    const read = await readSubjectPhotos({ subject: "acorn" });

    expect(read.answered).toBe(true);
    expect(read.photos).toHaveLength(1);
    expect(read.photos[0]).toMatchObject({ credit: "Ivar Leidus", locality: "anywhere" });
  });

  it("declines a disambiguation page rather than answering with a coincidence", async () => {
    // "Conker may refer to:" is a list of unrelated things and its lead image
    // belongs to none of them. The live keyword fallback answered this with a
    // photograph of a man named Conker.
    stubCanonical({ pageimage: "Something.jpg", extract: "Conker may refer to:" });

    const read = await readSubjectPhotos({ subject: "conker" });

    expect(read.photos).toEqual([]);
    expect(read.answered).toBe(false);
  });

  it("says nothing when the thing has no picture, rather than finding one anyway", async () => {
    // Wikipedia has an article on thunder and no image for it, because a sound
    // has no picture. That is a correct answer and the product repeats it.
    stubCanonical({ extract: "Thunder is the sound caused by lightning." });

    const read = await readSubjectPhotos({ subject: "thunder" });
    expect(read.photos).toEqual([]);
  });

  it("shows a canonical image that arrived with no credit", async () => {
    stubCanonical(
      { pageimage: "Uncredited.jpg", extract: "A thing." },
      page(201, "File:Uncredited.jpg", { artist: null })
    );

    const read = await readSubjectPhotos({ subject: "a thing" });
    expect(read.photos).toHaveLength(1);
  });

  it("asks for nothing when given nothing", async () => {
    const read = await readSubjectPhotos({ subject: "   " });
    expect(read).toEqual({ photos: [], answered: false });
  });

  it("asks once for a repeated subject", async () => {
    stubCanonical(
      { pageimage: "Moon.jpg", extract: "The Moon is the only natural satellite of Earth." },
      page(202, "File:Moon.jpg")
    );
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    await readSubjectPhotos({ subject: "moon" });
    const before = fetchMock.mock.calls.length;
    await readSubjectPhotos({ subject: "moon" });

    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

/**
 * The depiction ranking still runs, on the surface that still ranks: the area
 * strip, which takes whatever is geotagged nearby and has to order it.
 *
 * "acorn" near a north London school returned "Acorn sculpture in Tottenham
 * Marshes". A child asking what an acorn is, shown a monument, has been
 * answered wrongly by something that looked confident.
 */
describe("depictions rank behind the real thing", () => {
  it("puts a real tree in front of a sculpture of one", async () => {
    respondWith([
      page(300, "File:Acorn sculpture in Tottenham Marshes.jpg"),
      page(301, "File:Oak tree on the green.jpg"),
    ]);

    const read = await readPlacePhotos({ ...somewhere(), limit: 2 });

    expect(read.photos[0]?.title).toBe("Oak tree on the green");
    expect(read.photos[1]?.title).toBe("Acorn sculpture in Tottenham Marshes");
  });

  it("still shows the sculpture when it is all there is", async () => {
    // Better a statue of the thing, captioned, than an empty answer.
    respondWith([page(310, "File:Acorn sculpture in Tottenham Marshes.jpg")]);

    const read = await readPlacePhotos({ ...somewhere(), limit: 2 });
    expect(read.photos).toHaveLength(1);
  });
});

/**
 * THE ENTITY: what a thing is, what it looks like, and who said so.
 *
 * Johan, 2026-08-17: "so if a student asks what is a sedementary rock? this
 * could be a clickable entity with photos..."
 *
 * A child asks the teacher, in a field, with thirty others waiting. One
 * sentence and one picture, and it has to be right. Nothing here is composed:
 * the sentence is the encyclopaedia's own opening line and the picture is its
 * chosen image, both attributed.
 */
describe("the entity behind a child's question", () => {
  it("carries the opening sentence, the picture and the article", async () => {
    stubCanonical(
      {
        pageimage: "Sedimentary.jpg",
        extract:
          "Sedimentary rocks are types of rock formed by the cementation of sediments. They cover much of the Earth.",
      },
      page(400, "File:Sedimentary.jpg")
    );

    const entity = await readSubjectEntity("sedimentary rock");

    expect(entity?.title).toBeTruthy();
    // ONE sentence, not the paragraph. An intro reads as an article; one
    // sentence reads as an answer, which is what she needs standing in a field.
    expect(entity?.definition).toBe(
      "Sedimentary rocks are types of rock formed by the cementation of sediments."
    );
    expect(entity?.photo).not.toBeNull();
    expect(entity?.sourceUrl).toContain("wikipedia.org/wiki/");
  });

  it("is still a real answer when the thing has no picture", async () => {
    // Thunder is a sound. A definition with no photograph is the truth about
    // it, and better than refusing to answer at all.
    stubCanonical({ extract: "Thunder is the sound caused by lightning." });

    const entity = await readSubjectEntity("thunder");

    expect(entity?.definition).toBe("Thunder is the sound caused by lightning.");
    expect(entity?.photo).toBeNull();
  });

  it("declines a disambiguation page instead of answering with a coincidence", async () => {
    stubCanonical({ pageimage: "Whatever.jpg", extract: "Conker may refer to:" });

    expect(await readSubjectEntity("conker")).toBeNull();
  });

  it("takes the pronunciation guide and the em dash out of the sentence", async () => {
    // What the live article actually gives a teacher to read to a class:
    //   "A lichen ( LY-kən, UK also LITCH-ən) is a hybrid colony..."
    // A phonetic respelling is furniture for a reader and noise for a speaker,
    // and the em dash is a character this product prints nowhere.
    stubCanonical(
      {
        pageimage: "Lichen.jpg",
        extract: "A lichen ( LY-kən, UK also LITCH-ən) is a colony of algae—and fungi. It grows slowly.",
      },
      page(402, "File:Lichen.jpg")
    );

    const entity = await readSubjectEntity("lichen");

    expect(entity?.definition).toBe("A lichen is a colony of algae, and fungi.");
    expect(entity?.definition).not.toMatch(/[—–]/);
  });

  it("does not mistake an abbreviation for the end of the sentence", async () => {
    // Splitting on the first ". " cut the sedimentary rock definition off at
    // "sediments, i.e." and handed a teacher half a clause.
    stubCanonical(
      {
        pageimage: "Sed.jpg",
        extract: "Sedimentary rocks are formed from sediments, i.e. particles of sand. They cover much of Earth.",
      },
      page(403, "File:Sed.jpg")
    );

    const entity = await readSubjectEntity("sedimentary rock");

    expect(entity?.definition).toBe(
      "Sedimentary rocks are formed from sediments, i.e. particles of sand."
    );
  });

  it("declines when asked about nothing", async () => {
    expect(await readSubjectEntity("   ")).toBeNull();
  });

  it("asks once for a repeated question", async () => {
    stubCanonical(
      { pageimage: "Moon.jpg", extract: "The Moon is the only natural satellite of Earth." },
      page(401, "File:Moon.jpg")
    );
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    await readSubjectEntity("the moon");
    const before = fetchMock.mock.calls.length;
    await readSubjectEntity("The Moon");

    // Cased differently, same question. A class asking twice costs one read.
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE DEADLINE HAS TO COVER THE BODY (#952).
 *
 * The guard used to be an `AbortController` whose timer was cleared in
 * `.finally()` on the FETCH promise. That promise settles when the response
 * HEADERS arrive, so the abort was disarmed at exactly the moment the bytes
 * started streaming and `await response.json()` had no deadline at all. A
 * Commons response that answers 200 and then stalls mid-body hung the read
 * forever, and `/world` is force-dynamic and awaits this inside a `Promise.all`
 * with no Suspense boundary — so the stall was a blank page, not a slow one.
 *
 * These specs cannot be written against a stub that ignores the signal, because
 * ignoring the signal is the bug. The stub below errors its body stream when
 * the signal aborts, which is what a real fetch does.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A response whose headers arrive and whose body never does.
 *
 * The stream stays open until the caller's own signal aborts it. Given a guard
 * that covers the body, the read is abandoned on schedule; given one that
 * covers only the headers, nothing ever settles.
 */
function respondWithStalledBody(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const signal = init?.signal ?? null;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal?.addEventListener("abort", () => {
          controller.error(signal.reason ?? new Error("aborted"));
        });
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

/** The production deadline is five seconds; a spec may not wait that long. */
function shortenTheDeadline() {
  const real = AbortSignal.timeout.bind(AbortSignal);
  return vi.spyOn(AbortSignal, "timeout").mockImplementation(() => real(25));
}

describe("a stalled body is abandoned on schedule", () => {
  it(
    "gives up on a response that answers 200 and then never sends its body",
    // Its own budget: a regression here hangs, and a hang must fail fast
    // rather than sit on CI until the suite's default runs out.
    { timeout: 2_000 },
    async () => {
      const timeoutSpy = shortenTheDeadline();
      respondWithStalledBody();

      const read = await readPlacePhotos(somewhere());

      // Say nothing, the same as any other failure. The point is that this
      // line is reached at all: with a headers-only guard it never is.
      expect(read).toEqual({ photos: [], answered: false });
      // The deadline the module actually asked for is a real one, not the
      // 25ms this spec substituted to keep itself quick.
      expect(timeoutSpy).toHaveBeenCalled();
      expect(timeoutSpy.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(1_000);
    }
  );

  it(
    "gives up on a stalled body when asking the encyclopaedia about a thing",
    { timeout: 2_000 },
    async () => {
      // The same pattern guarded all three call sites, so all three are read.
      shortenTheDeadline();
      respondWithStalledBody();

      await expect(readSubjectEntity("acorn")).resolves.toBeNull();
    }
  );
});

describe("a failed read is remembered, not re-paid on every render", () => {
  it("asks once when the upstream answers badly", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const place = somewhere();

    expect(await readPlacePhotos(place)).toEqual({ photos: [], answered: false });
    expect(await readPlacePhotos(place)).toEqual({ photos: [], answered: false });

    // `/world` re-renders per teacher per visit. An uncached failure means
    // every one of those re-pays the full timeout while Commons is unwell.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks once when the read threw rather than answering", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    vi.stubGlobal("fetch", fetchMock);
    const place = somewhere();

    await readPlacePhotos(place);
    await readPlacePhotos(place);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tries again after a minute, rather than staying silent for the hour a success gets", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async () => new Response("nope", { status: 503 }));
      vi.stubGlobal("fetch", fetchMock);
      const place = somewhere();

      await readPlacePhotos(place);
      // A failure is a back-off, not an answer. Caching it for the full hour
      // would turn one bad minute upstream into an hour of empty place pages.
      vi.advanceTimersByTime(61_000);
      await readPlacePhotos(place);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
