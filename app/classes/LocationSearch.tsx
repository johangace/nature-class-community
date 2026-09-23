"use client";

import { useId, useRef, useState } from "react";
import { setClassLocation } from "./actions";

interface PlaceMatch {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

type Search = "idle" | "searching" | "results" | "empty" | "failed";

/**
 * The typed way in, for the teacher whose device will not give a position
 * (#181). A laptop with Location Services off, a desktop with no radio, a
 * browser that refused the prompt: each ends at the same dead end unless she
 * can type the school, park or town instead. This is the search /start
 * already has, reading the same /api/geocode route, and the pick travels the
 * same setClassLocation action a tapped position does. One seam, two ways in.
 */
export function LocationSearch({
  classId,
  returnTo,
}: {
  classId: string;
  returnTo: "/today" | "/classes";
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Search>("idle");
  const [matches, setMatches] = useState<PlaceMatch[]>([]);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2 || search === "searching") return;
    const mine = ++seq.current;
    setSearch("searching");
    setMatches([]);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("search failed");
      const data = (await response.json()) as { results?: PlaceMatch[] };
      if (mine !== seq.current) return;
      const found = data.results ?? [];
      setMatches(found);
      setSearch(found.length ? "results" : "empty");
    } catch {
      if (mine === seq.current) setSearch("failed");
    }
  }

  function pick(match: PlaceMatch) {
    if (saving) return;
    setSaving(true);
    const form = new FormData();
    form.set("classId", classId);
    form.set("lat", String(match.lat));
    form.set("lng", String(match.lng));
    form.set("returnTo", returnTo);
    void setClassLocation(form);
  }

  return (
    <form className="loc-search" onSubmit={run}>
      <label className="loc-search-label" htmlFor={`${id}-place`}>
        Or type the school, park or town
      </label>
      <span className="loc-search-row">
        <input
          id={`${id}-place`}
          className="loc-search-input"
          type="text"
          maxLength={160}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (search !== "idle") setSearch("idle");
          }}
        />
        <button
          type="submit"
          className="loc-search-go"
          disabled={query.trim().length < 2 || search === "searching"}
        >
          {search === "searching" ? "Looking…" : "Find"}
        </button>
      </span>
      <div aria-live="polite">
        {search === "results" && (
          <ul className="loc-search-matches">
            {matches.map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  className="loc-search-match"
                  disabled={saving}
                  onClick={() => pick(match)}
                >
                  {match.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {search === "empty" && (
          <p className="loc-search-error">No place came back for that. Try a town or postcode.</p>
        )}
        {search === "failed" && (
          <p className="loc-search-error">Place search is unreachable just now. Try again.</p>
        )}
      </div>
    </form>
  );
}
