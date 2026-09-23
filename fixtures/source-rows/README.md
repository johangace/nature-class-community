# Source rows

The curriculum rows this repo's packs were ported FROM, kept here so the port
can be checked instead of trusted.

These are Johan's own authored sessions, pulled from the old production
database, in his repo, under its licence. Committing them is deliberate: a
fidelity check that needs a database connection is a check that never runs in
CI, and a check that never runs is how `packs/summer.json` shipped with every
situational tip quietly rewritten and the driving question dropped entirely
(#130).

## What is here

| file | rows | provenance |
|---|---|---|
| `summer.json` | ids 17-20, `season_key="summer"`, active | the four sessions the old production database had live, ported into `packs/summer.json` |
| `spring.json` | ids 1-4, `season_key="spring"`, inactive | the four spring flagships on the season shelf, ported into `packs/spring-term.json` |

## What "verbatim" means here

The **strings are untouched**. Nothing was trimmed, sentence-cased, punctuated,
or improved on the way in. The JSON was re-indented on write and non-ASCII
characters (an emoji, a curly apostrophe) are stored as literal characters
rather than `\u` escapes, so the file is readable in a diff; both are
serialisation, not content, and `JSON.parse` of either gives the same string.

If a string in here looks like a typo, it is Johan's typo and it ships. That
judgement is his. Taking it was the whole bug.

## How it is used

`scripts/verbatim-fidelity.mjs` reads these rows, harvests every authored
string, and fails CI unless each one appears byte-identical somewhere in the
pack it was ported into. Read that script's header for the allowlist rules
before you consider adding one.

## What the rows carry that the packs cannot

One field, and it is written down rather than left silent. Three spring
make-steps carry a `referenceImageUrl` pointing at `images.unsplash.com`. The
block union in `schema/pack.ts` has no image kind, so there is nowhere in a
pack to put it, and a pack may not name a domain we do not control — a stock
URL can 404 or change what it shows, in front of a class. It is listed in
`NON_PROSE_FIELDS` with that reasoning, and nature-class#147 holds the question
of whether reference images become a real block kind on storage we own.

Everything else on these rows reaches its pack byte-identical, or is checked
more strictly than a string match would be (`duration` numerically, `senses`
through the skill line).

## What is missing

Nothing. Both seasons the old database had authored are here and checked
(#130 for summer, #140 for spring). The remaining packs on the shelf —
`autumn-*`, `winter-term`, and spring weeks 5-12 — were written in this repo
rather than ported, so they have no source row to be checked against. If a
future season is ported from anywhere, its rows land here in the same commit
as the port, not afterwards: spring shipped in front of teachers for months
with its teaching depth rewritten, and the only reason nobody saw it was that
nothing compared the two.
