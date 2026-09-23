"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wordmark } from "@/app/Wordmark";
import { track } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { takeJoinCohort, takeJoinSchool } from "@/lib/join-prefill";
import type { Locale } from "@/lib/localization";
import { PlaceMap } from "@/app/place/PlaceMap";
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_HREF } from "@/lib/outside/static-map";
import type { ResolvedPlace } from "@/lib/outside";
import { createClassFromFlow, finishStartFlow } from "./actions";
import { openExamplePlace, rememberTryPlace } from "./try-actions";
import { EXAMPLE_PLACES } from "@/lib/example-places";
import type { TryPlace } from "@/lib/try-place";
import {
  afterSearchResults,
  confirmLocation,
  type LocationRoute,
  type LocationState,
  schoolOfRecord,
} from "./location-state";
import { AGE_RANGES, GROUP_OPTIONS, GROUP_TYPES, type GroupType, type AgeRange } from "./vocab";

type Step = 1 | 2;
type SearchState = "idle" | "searching" | "results" | "empty" | "failed";

interface Shelf {
  sessionCount: number;
  firstTitle: string;
  packTitle: string;
}

interface Draft {
  classId?: string;
  name: string;
  yearGroup: string;
  groupType: GroupType;
  ageRange: AgeRange;
  /** Legacy required place name, supplied by the selected location. */
  school: string;
  /**
   * True once the name in `school` is the teacher's own — typed by her, or
   * carried in from a join link — rather than the label of the place she
   * picked. While it is false the field follows the confirmed place, so
   * changing the place changes the default with it.
   */
  schoolEdited: boolean;
  lat: number | null;
  lng: number | null;
  /** The invite link's cohort code (#821), carried from /join; never shown. */
  inviteCohort?: string | null;
}

interface PlaceMatch {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface Resume {
  classId: string;
  name: string;
  yearGroup: string;
  groupType?: string | null;
  ageRange?: string | null;
  school: string;
  lat: number | null;
  lng: number | null;
}

/**
 * First run has one job: create a usable group in a known place. The richer
 * Class and Grounds profiles live in their permanent homes and are offered as
 * optional follow-up work on Today, not as a toll before a teacher can enter.
 */
/**
 * Two modes, one screen shared (#877).
 *
 * "class" is first run for a signed-in teacher: name the class, then place
 * it. "try" is the signed-out visitor: the location screen alone, no class
 * name, no year group, and the spot goes into her browser rather than a row.
 * Johan's ruling: "we can simplify and show season and only first session
 * open gives her full pic and minimal changes". Same screen, so the map, the
 * search and the live read behind it are the ones a teacher gets, not a demo
 * of them.
 *
 * `remembered` is the spot from that cookie. In try mode it survives a
 * reload; in class mode it seeds the location step so the one thing she
 * already told us is not asked twice.
 */
export function StartFlow({
  resume = null,
  mode = "class",
  remembered = null,
}: {
  shelf: Shelf;
  resume?: Resume | null;
  locale?: Locale;
  mode?: "class" | "try";
  remembered?: TryPlace | null;
}) {
  const trying = mode === "try";
  const [step, setStep] = useState<Step>(resume || trying ? 2 : 1);
  const [draft, setDraft] = useState<Draft>(
    resume
      ? { ...resume, schoolEdited: Boolean(resume.school.trim()),
          groupType: GROUP_TYPES.includes(resume.groupType as GroupType) ? resume.groupType as GroupType : "school",
          ageRange: AGE_RANGES.includes(resume.ageRange as AgeRange) ? resume.ageRange as AgeRange : "4–6",
        }
      : {
          name: "",
          yearGroup: "",
          groupType: "school",
          ageRange: "4–6",
          school: "",
          schoolEdited: false,
          lat: remembered?.lat ?? null,
          lng: remembered?.lng ?? null,
        }
  );

  // The cohort is taken on resume too: it goes to her record, not a field,
  // and the server only ever fills an empty one (lib/invite-cohort.ts).
  useEffect(() => {
    const cohort = takeJoinCohort();
    if (cohort) setDraft((current) => ({ ...current, inviteCohort: cohort }));
  }, []);

  useEffect(() => {
    if (resume) return;
    const invited = takeJoinSchool();
    if (!invited) return;
    setDraft((current) =>
      current.school.trim()
        ? current
        : { ...current, school: invited, schoolEdited: true }
    );
  }, [resume]);

  return (
    <main className="start-flow">
      <div className="start-topbar">
        <Wordmark className="start-brand" seed />
        <span className="start-context">welcome</span>
      </div>

      {step === 1 ? (
        <ClassStep
          draft={draft}
          setDraft={setDraft}
          onNext={() => setStep(2)}
        />
      ) : (
        <LocationStep
          draft={draft}
          setDraft={setDraft}
          onBack={() => setStep(1)}
          trying={trying}
          remembered={remembered !== null && !resume}
          rememberedLabel={remembered?.label ?? null}
        />
      )}
    </main>
  );
}

function StepDots({ on }: { on: Step }) {
  return (
    <div className="start-steps">
      <span className="start-dots" aria-hidden="true">
        <span className="start-dot on" />
        <span className={on === 2 ? "start-dot on" : "start-dot"} />
      </span>
    </div>
  );
}

function ClassStep({ draft, setDraft, onNext }: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onNext: () => void;
}) {
  const group = GROUP_OPTIONS.find((option) => option.value === draft.groupType)!;
  return (
    <section className="start-screen">
      <p className="start-eyebrow">1 of 2 · your group</p>
      <StepDots on={1} />
      <h1 className="start-headline">Who is this for?</h1>
      <div className="start-field start-group-options" role="group" aria-label="Who is this for?">
        {GROUP_OPTIONS.map((option) => (
          <button type="button" key={option.value}
            className={draft.groupType === option.value ? "start-chip on" : "start-chip"}
            aria-pressed={draft.groupType === option.value}
            onClick={() => setDraft((current) => ({ ...current, groupType: option.value }))}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="start-field">
        <label className="start-label" htmlFor="start-name">Group name (optional)</label>
        <input id="start-name" className="start-input" type="text" maxLength={80}
          placeholder={group.placeholder} value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
      </div>
      <div className="start-field">
        <span className="start-label">What age range?</span>
        <div className="start-pills" role="group" aria-label="What age range?">
          {AGE_RANGES.map((ageRange) => (
            <button key={ageRange} type="button"
              className={draft.ageRange === ageRange ? "start-chip on" : "start-chip"}
              aria-pressed={draft.ageRange === ageRange}
              onClick={() => setDraft((current) => ({ ...current, ageRange }))}>
              {ageRange}
            </button>
          ))}
        </div>
      </div>
      <div className="start-foot">
        <button type="button" className="start-pill wide" onClick={onNext}>Continue</button>
      </div>
    </section>
  );
}

function LocationStep({
  draft,
  setDraft,
  onBack,
  trying = false,
  remembered = false,
  rememberedLabel = null,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onBack: () => void;
  /** The signed-out try mode: keep the spot in the browser, open the season. */
  trying?: boolean;
  /** The draft's position came from the try cookie, not a saved class. */
  remembered?: boolean;
  /** The name she chose it by, kept with the cookie (#922). */
  rememberedLabel?: string | null;
}) {
  const [state, setState] = useState<LocationState>(
    draft.lat !== null && draft.lng !== null ? "grounded" : "empty"
  );
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>("idle");
  const [matches, setMatches] = useState<PlaceMatch[]>([]);
  const searchSeq = useRef(0);
  const restored = useRef(false);
  const locationSeq = useRef(0);
  const [activeMatch, setActiveMatch] = useState(-1);
  const addressField = useRef<HTMLInputElement>(null);
  const [route, setRoute] = useState<LocationRoute>(
    draft.lat !== null && draft.lng !== null
      ? remembered
        ? "remembered"
        : "restored"
      : "browser"
  );
  const [picked, setPicked] = useState<string | null>(
    remembered ? (rememberedLabel ?? null) : null
  );

  const groundToCoords = useCallback(
    async (lat: number, lng: number) => {
      const seq = ++locationSeq.current;
      setPlace(null);
      setDraft((current) => ({ ...current, lat, lng }));
      setState("grounded");
      try {
        // The read is asked for one thing only: the geocoder's name for the
        // point, so the confirmation can be argued with. This step used to
        // pour the whole day out here (the sky, the species, the season),
        // which answered a question about where she goes outside with a page
        // about what it is like today, and buried the one claim a teacher
        // standing in her own playground could catch. Today's conditions have
        // their own home, on Today.
        const response = await fetch(`/api/outside?lat=${lat}&lng=${lng}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const read = (await response.json()) as { place?: ResolvedPlace | null };
        if (seq === locationSeq.current) setPlace(read.place ?? null);
      } catch {
        // The coordinates are still a valid location, and the map is drawn
        // from them. Only the place NAME is missing, and the card says so.
      }
    },
    [setDraft]
  );

  useEffect(() => {
    if (restored.current || draft.lat === null || draft.lng === null) return;
    restored.current = true;
    void groundToCoords(draft.lat, draft.lng);
  }, [draft.lat, draft.lng, groundToCoords]);

  function geolocate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("error");
      return;
    }
    ++searchSeq.current;
    const seq = ++locationSeq.current;
    setQuery("");
    setMatches([]);
    setSearch("idle");
    setRoute("browser");
    setPicked(null);
    setState("prompting");
    navigator.geolocation.getCurrentPosition(
      (position) => { if (seq === locationSeq.current) void groundToCoords(position.coords.latitude, position.coords.longitude); },
      (error) => { if (seq === locationSeq.current) setState(error.code === error.PERMISSION_DENIED ? "denied" : "error"); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  useEffect(() => {
    const q = query.trim();
    const seq = ++searchSeq.current;
    if (q.length < 2 || q === picked) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch("searching");
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&autocomplete=1`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("search failed");
        const data = (await response.json()) as { results?: PlaceMatch[] };
        if (seq !== searchSeq.current) return;
        const found = data.results ?? [];
        setMatches(found);
        setActiveMatch(-1);
        setSearch(found.length ? "results" : "empty");
        setState((previous) => afterSearchResults(previous, found.length));
      } catch {
        if (seq === searchSeq.current && !controller.signal.aborted) setSearch("failed");
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, picked]);

  function pick(match: PlaceMatch) {
    ++searchSeq.current;
    setActiveMatch(-1);
    setSearch("idle");
    setMatches([]);
    setQuery(match.label);
    setRoute("typed");
    setPicked(match.label);
    void groundToCoords(match.lat, match.lng);
  }

  function clearLocation() {
    ++locationSeq.current;
    ++searchSeq.current;
    setQuery("");
    setDraft((current) => ({ ...current, lat: null, lng: null }));
    setPlace(null);
    setPicked(null);
    setRoute("browser");
    setMatches([]);
    setSearch("idle");
    setState("empty");
    addressField.current?.focus();
  }

  const grounded = state === "grounded";
  const located =
    grounded && draft.lat !== null && draft.lng !== null
      ? confirmLocation({
          route,
          lat: draft.lat,
          lng: draft.lng,
          place,
          pickedLabel: picked,
        })
      : null;

  // Keep an existing/invited school name; otherwise the selected place supplies
  // the required legacy column without asking for the same place twice.
  const school = schoolOfRecord(draft.school, draft.schoolEdited, located?.label ?? located?.headline ?? null).slice(0, 120);
  // Try mode writes no class row, so it needs no name for one.
  const ready = grounded && (trying || school.trim().length > 0);

  /**
   * She would rather see it somewhere already chosen than type her own place
   * (#877, third slice). Same cookie and same season as the question above;
   * the surfaces name the place and say it is an example, not her school.
   */
  async function openExample(slug: string) {
    if (saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await openExamplePlace(slug);
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  }

  async function proceed() {
    if (saving || !ready) return;
    setSaving(true);
    setSaveError(false);
    if (trying) {
      // No row. The spot goes in her browser and the season opens for it.
      try {
        // The name she saw is kept with the spot: her pick from the search,
        // else what the read called the point, else nothing (#922).
        await rememberTryPlace(
          draft.lat as number,
          draft.lng as number,
          picked ?? place?.name ?? null
        );
      } catch {
        setSaveError(true);
        setSaving(false);
      }
      return;
    }
    try {
      const saved = await createClassFromFlow({
        classId: draft.classId,
        name: draft.name,
        yearGroup: draft.yearGroup,
        groupType: draft.groupType,
        ageRange: draft.ageRange,
        school: school.trim(),
        lat: draft.lat,
        lng: draft.lng,
        inviteCohort: draft.inviteCohort ?? null,
      });
      // The cohort her record holds, not the one this browser carried: an
      // earlier invite wins, and an organic sign-up sends none.
      track(
        ANALYTICS_EVENTS.START_FLOW_COMPLETED,
        saved.inviteCohort ? { invite_cohort: saved.inviteCohort } : {}
      );
      await finishStartFlow();
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  }

  return (
    <section className="start-screen">
      {trying ? (
        <>
          <h1 className="start-headline">Where will you use it?</h1>
          <p className="start-hint">
            We use this for today&rsquo;s weather, the season and nearby nature. It stays
            in your browser. Nothing is saved until you sign in.
          </p>
        </>
      ) : (
        <>
          <p className="start-eyebrow">2 of 2 · your location</p>
          <StepDots on={2} />
          <h1 className="start-headline">Where will you use it?</h1>
          <p className="start-hint">
            We use this for local weather, seasons and nearby nature. You can change it later.
          </p>
        </>
      )}

      <button
        type="button"
        className="start-geo"
        onClick={geolocate}
        disabled={state === "prompting"}
      >
        <span className="start-geo-dot" aria-hidden="true" />
        {state === "prompting" ? "Finding your location…" : "Use current location"}
      </button>

      <div className="start-field">
        <label className="start-label" htmlFor="start-address">Address, postcode or place</label>
        <input
          id="start-address"
          ref={addressField}
          className="start-input"
          type="text"
          maxLength={160}
          autoComplete="off"
          placeholder="Start typing an address or place"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={search === "results"}
          aria-controls="start-matches"
          aria-activedescendant={activeMatch >= 0 ? `start-match-${activeMatch}` : undefined}
          aria-describedby="start-address-hint"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActiveMatch((current) => matches.length ? (current < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : (current + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length) : -1);
            } else if (event.key === "Enter" && activeMatch >= 0 && matches[activeMatch]) {
              event.preventDefault(); pick(matches[activeMatch]);
            } else if (event.key === "Escape") {
              ++searchSeq.current; setMatches([]); setSearch("idle"); setActiveMatch(-1);
            }
          }}
          value={query}
          onChange={(event) => {
            ++searchSeq.current;
            ++locationSeq.current;
            setQuery(event.target.value);
            setMatches([]); setActiveMatch(-1); setSearch("idle");
            setPicked(null); setPlace(null); setState("empty");
            setDraft((current) => ({ ...current, lat: null, lng: null }));
          }}
        />
        <p className="start-hint quiet" id="start-address-hint">
          {search === "searching" ? "Finding places…" : located ? "Location selected. Check the map below." : "Select a suggestion to confirm your location."}
        </p>
      </div>

      <div aria-live="polite">
        {search === "results" && (
          <div className="start-field">
            <p className="start-label">Select a location</p>
            <ul className="start-matches" id="start-matches" role="listbox" aria-label="Matching places">
              {matches.map((match, index) => (
                <li key={match.id} id={`start-match-${index}`} role="option" aria-selected={index === activeMatch}>
                  <button type="button" className={index === activeMatch ? "start-match on" : "start-match"} tabIndex={-1} onClick={() => pick(match)}>
                    {match.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {search === "empty" && (
          <p className="start-input-error">No place came back for that. Try a town or postcode.</p>
        )}
        {search === "failed" && (
          <p className="start-input-error">
            We couldn&rsquo;t reach place search. Your details are still here, so try again.
          </p>
        )}
      </div>

      {located && draft.lat !== null && draft.lng !== null && (
        <section className="outside-card start-located" aria-live="polite">
          <PlaceMap
            className="start-located-map"
            lat={draft.lat}
            lng={draft.lng}
            label={located.label ?? "the position we have"}
            compact
          />
          <a className="start-hint quiet" href={MAP_ATTRIBUTION_HREF} target="_blank" rel="noreferrer">{MAP_ATTRIBUTION}</a>
          <p className="start-label start-location-confirmed"><span aria-hidden="true">✓</span> Location selected</p>
          <p className="outside-headline">{located.headline}</p>
          <p className="outside-meta">{located.provenance}</p>
          {located.address && (
            <p className="start-located-address">
              <span className="start-eyebrow start-plate-label">Map address</span>
              <span>{located.address}</span>
            </p>
          )}
          {located.unnamed && <p className="outside-meta">{located.unnamed}</p>}
          <button type="button" className="start-link" onClick={clearLocation}>
            Change location
          </button>
        </section>
      )}

      {(state === "denied" || state === "error") && (
        <section className="outside-card start-refused">
          <p className="outside-headline">
            {state === "denied" ? "Location permission was declined." : "We couldn't get your location."}
          </p>
          <p className="outside-meta">
            Enter the school, park or address above, or change your browser permission and try again.
          </p>
          <button type="button" className="start-link" onClick={geolocate}>Try again</button>
        </section>
      )}

      {saveError && (
        <p className="start-input-error" role="alert">
          {trying
            ? "We couldn’t keep that place. Everything you entered is still here, so try again."
            : "We couldn’t save your setup. Everything you entered is still here, so try again."}
        </p>
      )}

      <div className="start-foot">
        <button
          type="button"
          className="start-pill wide"
          onClick={proceed}
          disabled={saving || !ready}
        >
          {trying
            ? saving
              ? "Opening…"
              : "See today’s session"
            : saving
              ? "Opening…"
              : "Show activities"}
        </button>
        {!grounded ? (
          <p className="start-hint quiet">Choose a location to continue.</p>
        ) : ready ? null : (
          <p className="start-hint quiet">Choose a location to continue.</p>
        )}
        {trying ? (
          // The question is a door, never a wall — and since #877's third
          // slice the way past it is named. Three example places, a US one
          // first, each opening the season read live for a patch that is
          // honestly not hers.
          <div className="start-examples">
            <p className="start-hint quiet">Or see it running somewhere else, live:</p>
            <ul className="start-example-list">
              {EXAMPLE_PLACES.map((example) => (
                <li key={example.slug}>
                  <button
                    type="button"
                    className="start-link"
                    disabled={saving}
                    onClick={() => openExample(example.slug)}
                  >
                    {example.name}
                  </button>
                  <span className="start-example-shows">{example.shows}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button type="button" className="start-quiet" onClick={onBack}>Back</button>
        )}
      </div>
    </section>
  );
}
