# Pointmoon fixtures

Recorded payloads the deterministic suite replays. A surface is not proven by a
hand-built object that happens to have the fields the renderer reads; it is
proven by what the API actually returned, on a real morning, in a real place.

| File | Provenance |
|---|---|
| `berkeley_ca.json` | Recorded. Live read, Berkeley, 2026-08-11 (#167 / #177). |
| `phoenix_az.json` | Recorded. Live read, Phoenix, 2026-08-11. |
| `london_uk.json` | Recorded. Live read, London, 2026-08-11. |
| `london_uk_2026-08-17.json` | Recorded. Live read, London, 2026-08-17 — the first payload carrying `presence.taxonId`, per-species `recency` and observation photographs. |
| `london_uk_taxon_versions.json` | **Constructed on top of a recorded payload.** See below. |
| `cold_patch.json`, `rain_patch.json`, `wind_patch.json`, `thin_patch.json` | Constructed condition slices, small and deliberate. |

## `london_uk_taxon_versions.json` (#1030)

`london_uk_2026-08-17.json` verbatim, with three rows appended to
`facts.fieldSnapshot.observations.nearby`. Each is a second version of an
organism that payload already carries, written in the recorded rows' own shape
(same field names, same `presence` object, same `epistemicType` /
`sourceSupport` / baseline fields):

- **"Rock Dove"** — no `scientificName` at all, `presence.taxonId` `"3017"`,
  which is the id the recorded "Rock Pigeon" row carries. The case a
  name-string dedupe cannot see.
- **"Feral Pigeon" / `Columba livia domestica`** — the subspecies of that same
  species.
- **"Pieris"** — a genus-rank identification of the recorded "Cabbage White"
  (`Pieris rapae`).

**Why constructed.** The recorded corpus does show one taxon arriving twice —
the notable-birds list repeats four nearby species verbatim, taxon ids and all,
and that case is exercised on genuinely recorded data. It does not show the
cross-rank versions Johan was looking at on 2026-09-07, and no other payload in
the corpus does either. So those three rows are constructed to the recorded
shape rather than recorded.

The injected rows carry taxon ids in the `9000000` range so nobody can mistake
them for real iNaturalist ids. Nothing else in the payload is altered.
