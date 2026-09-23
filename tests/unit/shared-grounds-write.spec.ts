/**
 * The ownership and copy rules for shared Grounds (#827), and the 303 that
 * carries the teacher to the place she just chose (nc#949).
 *
 * This was shared-grounds-actions.spec.ts, against two server actions, until
 * the redirect those actions returned turned out to be droppable by the client
 * router — the write landed, the page stayed on the old place, and nothing
 * anywhere went red. Every assertion it made is still made here, against the
 * route handler that replaced them; the ones below it could not make are the
 * point of the move: that the answer is a real HTTP 303, and that a cross-site
 * POST is refused (a server action checked the origin for us; a route handler
 * has to do it itself).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (work: Promise<unknown>[]) => Promise.all(work)),
    class: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    grounds: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));
vi.mock("@/lib/teacher", () => ({ getTeacher: vi.fn() }));

import { POST } from "@/app/world/place/route";
import { prisma } from "@/lib/db";
import { getTeacher } from "@/lib/teacher";

const ENDPOINT = "http://localhost:3512/world/place";

/** A same-origin form POST, the shape a browser sends from /world. */
function formPost(fields: Record<string, string>, origin = "http://localhost:3512") {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request(ENDPOINT, { method: "POST", headers, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
});

describe("shared Grounds ownership", () => {
  it("assigns an owned Grounds profile without changing the active class", async () => {
    vi.mocked(prisma.class.findFirst).mockResolvedValue({ id: "hazel" } as never);
    vi.mocked(prisma.grounds.findFirst).mockResolvedValue({ id: "main-ground" } as never);

    const response = await POST(
      formPost({ intent: "assign", classId: "hazel", groundsId: "main-ground" })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3512/world?classId=hazel&groundsId=main-ground"
    );
    expect(prisma.class.findFirst).toHaveBeenCalledWith({
      where: { id: "hazel", teacherId: "teacher-1" },
      select: { id: true },
    });
    expect(prisma.grounds.findFirst).toHaveBeenCalledWith({
      where: { id: "main-ground", teacherId: "teacher-1" },
      select: expect.objectContaining({ id: true }),
    });
    expect(prisma.class.updateMany).toHaveBeenCalledWith({
      where: { id: "hazel", teacherId: "teacher-1" },
      data: expect.objectContaining({ groundsId: "main-ground" }),
    });
  });

  it("rejects a Grounds profile owned by another teacher", async () => {
    vi.mocked(prisma.class.findFirst).mockResolvedValue({ id: "hazel" } as never);
    vi.mocked(prisma.grounds.findFirst).mockResolvedValue(null);

    const response = await POST(
      formPost({ intent: "assign", classId: "hazel", groundsId: "someone-elses-ground" })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3512/classes");
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });

  it("creates a separate profile by copying every current place field", async () => {
    vi.mocked(prisma.class.findFirst).mockResolvedValue({
      id: "hazel",
      school: "St Mary's Primary",
      lat: 51.501,
      lng: -0.141,
      climate: "oceanic",
      grounds: ["trees"],
      siteFeatures: ["bug-hotel"],
      siteNotes: ["Reception garden"],
      reach: "small-area",
      placeRead: { place: "Ealing" },
      placeReadAt: new Date("2026-09-01T08:00:00Z"),
      groundsProfile: null,
    } as never);
    vi.mocked(prisma.grounds.create).mockResolvedValue({ id: "hazel-ground" } as never);

    const response = await POST(
      formPost({ intent: "create", classId: "hazel", name: "Hazel garden" })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(
      /^http:\/\/localhost:3512\/world\?classId=hazel&groundsId=/
    );
    expect(prisma.grounds.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Hazel garden",
        school: "St Mary's Primary",
        teacherId: "teacher-1",
        lat: 51.501,
        lng: -0.141,
        climate: "oceanic",
        habitats: ["trees"],
        siteFeatures: ["bug-hotel"],
        siteNotes: ["Reception garden"],
        reach: "small-area",
        placeRead: { place: "Ealing" },
        placeReadAt: new Date("2026-09-01T08:00:00Z"),
      }),
      select: { id: true },
    });
    const created = vi.mocked(prisma.grounds.create).mock.calls[0]?.[0].data;
    expect(prisma.class.updateMany).toHaveBeenCalledWith({
      where: { id: "hazel", teacherId: "teacher-1" },
      data: expect.objectContaining({ groundsId: created?.id }),
    });
  });
});

describe("the place change is a browser navigation, not a router one", () => {
  // The whole reason this endpoint exists. A 303 is performed by the browser;
  // the server-action redirect it replaced was performed by the client router,
  // which dropped it about two times in five and left the teacher looking at
  // the place she had just changed away from.
  it("answers a successful write with 303 See Other, not 200", async () => {
    vi.mocked(prisma.class.findFirst).mockResolvedValue({ id: "hazel" } as never);
    vi.mocked(prisma.grounds.findFirst).mockResolvedValue({ id: "main-ground" } as never);

    const response = await POST(
      formPost({ intent: "assign", classId: "hazel", groundsId: "main-ground" })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBeTruthy();
  });

  it("refuses a cross-site POST rather than moving the class", async () => {
    const response = await POST(
      formPost(
        { intent: "assign", classId: "hazel", groundsId: "main-ground" },
        "https://evil.example"
      )
    );

    expect(response.status).toBe(403);
    expect(prisma.class.findFirst).not.toHaveBeenCalled();
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a POST that carries no origin at all", async () => {
    const response = await POST(
      formPost({ intent: "assign", classId: "hazel", groundsId: "main-ground" }, "")
    );

    expect(response.status).toBe(403);
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });

  it("sends a signed-out teacher to sign in, and writes nothing", async () => {
    vi.mocked(getTeacher).mockResolvedValue(null as never);

    const response = await POST(
      formPost({ intent: "assign", classId: "hazel", groundsId: "main-ground" })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3512/sign-in");
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });

  it("writes nothing for an unknown intent", async () => {
    const response = await POST(formPost({ intent: "delete-everything", classId: "hazel" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3512/classes");
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
    expect(prisma.grounds.create).not.toHaveBeenCalled();
  });
});

/**
 * nc#955. `next start` builds `request.url` from the address it BOUND to, not
 * from the Host header, so on a self-hosted install behind nginx this endpoint
 * refused every place change with an empty 403 — and had the check passed, the
 * 303 would have named the proxy's own loopback. The requests below are that
 * deployment: the URL says 127.0.0.1, the browser says the school's own site.
 */
describe("a place change on a self-hosted install behind a proxy", () => {
  const PUBLIC = "https://nature.school.example";
  const BOUND = "http://127.0.0.1:3000/world/place";

  /** The same form POST, arriving the way a reverse proxy delivers it. */
  function proxiedPost(fields: Record<string, string>, origin = PUBLIC) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    const headers = new Headers({ host: "nature.school.example" });
    if (origin) headers.set("origin", origin);
    return new Request(BOUND, { method: "POST", headers, body });
  }

  beforeEach(() => {
    // The one origin a self-hoster already has to configure: sign-in refuses
    // anything else, which is why signing in worked here and this did not.
    vi.stubEnv("BETTER_AUTH_URL", PUBLIC);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("performs the write instead of answering 403", async () => {
    vi.mocked(prisma.class.findFirst).mockResolvedValue({ id: "hazel" } as never);
    vi.mocked(prisma.grounds.findFirst).mockResolvedValue({ id: "main-ground" } as never);

    const response = await POST(
      proxiedPost({ intent: "assign", classId: "hazel", groundsId: "main-ground" })
    );

    expect(response.status).toBe(303);
    expect(prisma.class.updateMany).toHaveBeenCalled();
  });

  it("sends the teacher back to her own site, not to the proxy's loopback", async () => {
    vi.mocked(prisma.class.findFirst).mockResolvedValue({ id: "hazel" } as never);
    vi.mocked(prisma.grounds.findFirst).mockResolvedValue({ id: "main-ground" } as never);

    const response = await POST(
      proxiedPost({ intent: "assign", classId: "hazel", groundsId: "main-ground" })
    );

    expect(response.headers.get("location")).toBe(
      "https://nature.school.example/world?classId=hazel&groundsId=main-ground"
    );
  });

  it("still refuses a cross-site POST, proxy or no proxy", async () => {
    const response = await POST(
      proxiedPost(
        { intent: "assign", classId: "hazel", groundsId: "main-ground" },
        "https://evil.example"
      )
    );

    expect(response.status).toBe(403);
    expect(prisma.class.findFirst).not.toHaveBeenCalled();
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an origin that only the Host header vouches for", async () => {
    // The header a proxy rewrites is not evidence: Next offers
    // experimental.trustHostHeader for exactly this and this repo does not set
    // it, so a request whose Host and Origin agree on a site we never
    // configured is still a cross-site request.
    const body = new FormData();
    body.set("intent", "assign");
    body.set("classId", "hazel");
    const response = await POST(
      new Request(BOUND, {
        method: "POST",
        headers: new Headers({
          host: "teachers.example.com",
          "x-forwarded-host": "teachers.example.com",
          origin: "https://teachers.example.com",
        }),
        body,
      })
    );

    expect(response.status).toBe(403);
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });
});
