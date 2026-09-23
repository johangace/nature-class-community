/**
 * THE HOUSE POSITION ON THIRD-PARTY OBSERVATION TOOLS (#758).
 *
 * A land-based educator, first real teacher session, 2026-08-31:
 * she runs colour hikes with "hyper-local iNaturalist", and for children she
 * reaches for **Seek** instead — "seek doesnt geolocate, children privacy"
 * (Johan's transcription; the session is at
 * `docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`).
 *
 * The audit that followed (`docs/observation-tools-audit-2026-08-31.md`) found
 * that this product currently sends nobody anywhere: no surface, pack, prompt
 * or printed sheet names an observation app at all. iNaturalist is in here as a
 * DATA SOURCE behind Pointmoon and as the subject of photo attribution, and
 * nowhere as a thing we ask a teacher or a class to go and use.
 *
 * So this file is not a fix for something rendered wrong today. It is the
 * answer written down before the question arrives — and the question is
 * already visible in the tree: `app/species/[slug]/page.tsx` carries a built
 * but dark "children found these before" row waiting on a child-photo upload
 * path, and `app/run/AssistantSheet.tsx` already puts a camera in a teacher's
 * hand mid-lesson. The next person to reach for an identification app should
 * find a decided answer here rather than pick the obvious one.
 *
 * ── THE POSITION ───────────────────────────────────────────────────────────
 *
 *   children observing   →  Seek. No account, no published record.
 *   an adult observing   →  iNaturalist proper. It is the right tool, and this
 *                           file is not an argument against it.
 *
 * ── WHAT WE MAY SAY OUT LOUD, AND WHAT WE MAY NOT ──────────────────────────
 *
 * "Seek does not geolocate" is the practitioner's shorthand and it is NOT
 * literally true; the accurate version is in `SEEK` below. Every claim in this
 * file carries the source it came from, because this repo's rule is that a
 * thing we cannot verify resolves to absent, never to a plausible value — and
 * a wrong confident sentence about a children's app is worse than silence.
 *
 * These facts were read on 2026-08-31 and are NOT self-verifying: a vendor can
 * change an app's behaviour between releases. `verifiedOn` is the date the
 * claim was read, and a claim old enough to matter should be re-read at the
 * URL beside it rather than trusted from here.
 */

/** Who is holding the device. The whole distinction this file exists for. */
export type ObservationAudience = "children-observing" | "adult-observer";

/** One sourced claim. No claim may travel without where it came from. */
export interface SourcedClaim {
  /** What we may say, in words we can defend. */
  claim: string;
  /** Where it was read. A URL, or a named document in this repo. */
  source: string;
  /** ISO date the source was read. */
  verifiedOn: string;
}

export interface ObservationTool {
  id: "seek" | "inaturalist";
  /** The name as its makers spell it. */
  name: string;
  /** Hosts this tool's own links live on. */
  hosts: readonly string[];
  /** Sourced facts about what it does with location and with records. */
  facts: readonly SourcedClaim[];
  /** What we could not establish. Absent, not guessed. */
  unverified: readonly string[];
}

/**
 * Seek by iNaturalist.
 *
 * The correction the shorthand needs: Seek DOES use location. What it does not
 * do is publish an observation record, and what it does not send is a precise
 * coordinate — the Seek privacy policy describes rounding to two decimal
 * places before transmission, which is on the order of a kilometre of latitude
 * (a degree of longitude narrows towards the poles, so the east-west figure is
 * smaller and this file does not put a number on it).
 */
export const SEEK: ObservationTool = {
  id: "seek",
  name: "Seek by iNaturalist",
  hosts: ["seek.inaturalist.org"],
  facts: [
    {
      claim:
        "Seek asks for location permission and uses it to suggest species from the " +
        "user's general area; iNaturalist describes the location as obscured, and " +
        "states that the precise location is never stored in the app or sent to " +
        "iNaturalist.",
      source: "https://www.inaturalist.org/pages/seek_app",
      verifiedOn: "2026-08-31",
    },
    {
      claim:
        "Coordinates transmitted by Seek to identify nearby species are rounded to " +
        "two decimal places before transmission, which the policy gives as the " +
        "mechanism protecting the user's precise location.",
      source: "https://www.inaturalist.org/pages/seek_privacy_policy",
      verifiedOn: "2026-08-31",
    },
    {
      claim:
        "Seek does not record observation information: badges and a personal list " +
        "live on the device and are not otherwise shared or recorded. iNaturalist " +
        "gives children's privacy and COPPA as the reason.",
      source: "https://www.inaturalist.org/pages/seek_app",
      verifiedOn: "2026-08-31",
    },
    {
      claim:
        "Signing in to Seek WITH an iNaturalist account is a different thing: some " +
        "user data is then collected, and the user must be over 13 or have a " +
        "parent's permission. The no-account path is the child-safe one.",
      source: "https://www.inaturalist.org/pages/seek_privacy_policy",
      verifiedOn: "2026-08-31",
    },
  ],
  unverified: [
    "Whether the current app-store data-safety declarations match the policy text.",
    "Whether behaviour differs by app version, platform or region.",
    "Whether any of this changes under a school's managed-device configuration.",
  ],
};

/**
 * iNaturalist proper — kept, deliberately, and not argued against.
 *
 * It is this product's species record (through Pointmoon) and the subject of
 * every photo credit we print. For an adult pre-walking her ground the day
 * before, as the teacher does, it is the right tool and the audit changed nothing
 * about it.
 */
export const INATURALIST: ObservationTool = {
  id: "inaturalist",
  name: "iNaturalist",
  hosts: ["www.inaturalist.org", "inaturalist.org", "api.inaturalist.org"],
  facts: [
    {
      claim:
        "An observation posted to iNaturalist is a public record carrying a " +
        "location, a date and the account that posted it. Geoprivacy can obscure " +
        "the coordinate to a 0.2-degree cell, but the record itself is published.",
      source: "https://www.inaturalist.org/pages/geoprivacy",
      verifiedOn: "2026-08-31",
    },
    {
      claim:
        "An iNaturalist account requires the user to be at least 13; under-13 " +
        "accounts need a parental-approval path. This is the COPPA line, and it " +
        "is the reason a class of primary-age children cannot simply post.",
      source:
        "https://help.inaturalist.org/en/support/solutions/articles/151000216150-how-can-i-make-an-account-for-my-child-who-is-under-13-years-of-age-",
      verifiedOn: "2026-08-31",
    },
    {
      claim:
        "iNaturalist's own guidance for educators recommends Seek for younger " +
        "children. The practitioner's preference and the vendor's advice agree.",
      source:
        "https://help.inaturalist.org/en/support/solutions/articles/151000170805-inaturalist-educator-s-guide",
      verifiedOn: "2026-08-31",
    },
  ],
  unverified: [
    "The exact current wording of the under-13 approval path and any fee.",
    "Whether UK-GDPR age-of-consent handling differs from the US COPPA framing.",
  ],
};

export const OBSERVATION_TOOLS: readonly ObservationTool[] = [SEEK, INATURALIST];

/**
 * The decision, as a function rather than as prose, so a surface that wants to
 * name a tool cannot quietly name the other one.
 */
export function recommendedObservationTool(audience: ObservationAudience): ObservationTool {
  return audience === "children-observing" ? SEEK : INATURALIST;
}

/**
 * What a link to an observation platform actually is. The kind is the whole
 * judgement: a licence receipt and an invitation to open an account are the
 * same host and completely different things.
 */
export type ObservationLinkKind =
  /** A photo page reached from a credit line. Attribution, not participation. */
  | "photo-provenance"
  /** Somebody else's already-published record or taxon page. Reference. */
  | "record"
  /** An invitation to take part: the app, an account, a new observation. */
  | "participation";

export interface ObservationLink {
  url: string;
  host: string;
  toolId: ObservationTool["id"];
  kind: ObservationLinkKind;
}

const TOOL_BY_HOST = new Map<string, ObservationTool>();
for (const tool of OBSERVATION_TOOLS) {
  for (const host of tool.hosts) TOOL_BY_HOST.set(host, tool);
}

/**
 * Classify one URL, or null when it is not an observation platform at all.
 *
 * Deliberately conservative in ONE direction: anything on these hosts that is
 * not recognisably a photo page or a record page is treated as
 * `participation`, because that is the reading that gets looked at rather than
 * waved through. A wrong guess towards "this is an invitation to join" costs a
 * conversation; a wrong guess the other way costs the thing this ticket is
 * about.
 */
export function classifyObservationUrl(value: string): ObservationLink | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const tool = TOOL_BY_HOST.get(host);
  if (!tool) return null;

  const path = parsed.pathname;
  if (/^\/photos\/[^/]+\/?$/.test(path)) {
    return { url: value, host, toolId: tool.id, kind: "photo-provenance" };
  }
  // A numbered observation or taxon is a published record. `/observations/new`
  // is not a record and must not read as one, so the id has to be digits.
  if (/^\/(observations|taxa)\/\d+\/?$/.test(path)) {
    return { url: value, host, toolId: tool.id, kind: "record" };
  }
  return { url: value, host, toolId: tool.id, kind: "participation" };
}

/**
 * Who a rendered surface faces. `class` means a room of children can see it or
 * hold it — the runner, the printed sheets, the speak-and-show.
 */
export type SurfaceAudience = "teacher" | "class";

/**
 * EVERY hardcoded link to an observation platform that rendered code is
 * allowed to carry, with who sees it and why.
 *
 * It is empty, and the emptiness is the audited finding of #758 rather than an
 * oversight: on 2026-08-31 no file under `app/` or `lib/` contained a literal
 * URL on any of these hosts. `tests/unit/observation-tools.spec.ts` holds the
 * tree to that, so the first one to appear arrives as a red test and a decision
 * instead of as a merged line nobody weighed.
 *
 * To add one: put the exact literal here with its audience and the reason. A
 * `participation` link on a `class` surface is refused by the guard outright —
 * that is the rule this ticket bought, and changing it is a Johan call, not a
 * declaration.
 */
export interface DeclaredObservationLink {
  /** The exact literal as it appears in the source. */
  literal: string;
  /** The file it lives in, relative to the repo root. */
  file: string;
  audience: SurfaceAudience;
  /** Why this link is right, in a sentence someone can disagree with. */
  why: string;
}

export const DECLARED_OBSERVATION_LINKS: readonly DeclaredObservationLink[] = [];

export interface ObservationLinkFinding {
  file: string;
  literal: string;
  link: ObservationLink;
  problem: "undeclared" | "participation-link-on-a-class-surface";
}

/** Every observation-platform URL literal in one file's source text. */
export function observationUrlsIn(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/https:\/\/[^\s"'`)\\<>]+/g)) {
    const raw = match[0].replace(/[.,;:]+$/, "");
    if (classifyObservationUrl(raw)) found.add(raw);
  }
  return [...found];
}

/**
 * The guard itself, as a pure function over files so the spec can feed it a
 * fabricated violation and watch it go red — a check nobody has seen fail is
 * not evidence (#554).
 */
export function auditObservationLinks(
  files: readonly { path: string; source: string }[],
  declared: readonly DeclaredObservationLink[] = DECLARED_OBSERVATION_LINKS
): ObservationLinkFinding[] {
  const findings: ObservationLinkFinding[] = [];
  for (const file of files) {
    for (const literal of observationUrlsIn(file.source)) {
      const link = classifyObservationUrl(literal);
      if (!link) continue;
      const declaration = declared.find(
        (d) => d.literal === literal && d.file === file.path
      );
      if (!declaration) {
        findings.push({ file: file.path, literal, link, problem: "undeclared" });
        continue;
      }
      if (declaration.audience === "class" && link.kind === "participation") {
        findings.push({
          file: file.path,
          literal,
          link,
          problem: "participation-link-on-a-class-surface",
        });
      }
    }
  }
  return findings;
}

/** The failure text, written so the red says what to do about it. */
export function describeObservationFinding(finding: ObservationLinkFinding): string {
  if (finding.problem === "participation-link-on-a-class-surface") {
    return (
      `${finding.file} puts a class of children in front of ${finding.literal}, ` +
      `which is an invitation to take part in ${finding.link.host} rather than a ` +
      `credit or a reference. For children observing, the tool is ` +
      `${SEEK.name} (#758). Changing this rule is Johan's call, not a declaration.`
    );
  }
  return (
    `${finding.file} carries an undeclared observation-platform link: ` +
    `${finding.literal} (${finding.link.kind}). Declare it in ` +
    `DECLARED_OBSERVATION_LINKS in lib/observation-tools.ts with its audience ` +
    `and the reason it is the right tool for that audience (#758).`
  );
}
