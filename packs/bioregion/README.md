# Bioregion packs

One file per pack key: `<key>.json`, validated against `bioregionPackSchema`
(`schema/bioregion.ts`). Plain files on disk, like the curriculum packs — no
database, no API, no network.

**This directory is empty, and that is the shipped state of wave 1.** office#330
J1 separated the schema wave from the data wave: all 26 dimensions are declared
and none are filled. Filling them is #209–#215, in order — true, then safe, then
enriched.

## Which key to author at

The chain is `polygon → koppen → latitude → global` (J4). The polygon link is
deferred and has no data; the live links are the Köppen group (`arid`,
`tropical`, `oceanic`, `subtropical`, `mediterranean`, `continental`, `polar`),
the latitude band (`lat-00-23`, `lat-23-35`, `lat-35-50`, `lat-50-66`,
`lat-66-90`), and `global`.

**Author at the coarsest key that still changes the teaching.** That is J4's
standing instruction, and it is a one-way door: a paragraph written for a
polygon cannot be re-used at Köppen granularity.

A lookup walks the chain and takes the first file that answers, so a `global`
file is a floor for every school on earth. Write one only for something that is
genuinely true everywhere.

## What an incomplete pack costs

`seasonOntology.drivers` is checked by the validity resolver
(`lib/validity.ts`). A driver you do not list is a driver this place does not
have, so **an under-declared pack silently shortens the shelf**: a Miami pack
that names its storms but forgets its sowing window loses the seed-bomb lesson,
and nothing on screen explains why.

That is the resolver behaving correctly — it refuses to assume a driver nobody
wrote down, exactly as it refuses to invent one — and the cost lands as a
shorter list rather than a wrong lesson, which is the right way round. But it
means the driver list is the field to be thorough in.
`tests/unit/pack-key-chain.spec.ts` holds a worked example of both halves.

## What must not go in one

- **No restricted-licence data.** A public pack file in an AGPL repo is a
  redistribution. J9: case by case, and every case lands on the board before
  data ships.
- **No indigenous-specific content.** J8: excluded until a partnership makes
  permission real. Ordinary local culture (conkers, hurricane lore) ships
  normally.
- **Nothing about a child.** Pollen is a fact about the air; observance windows
  are dates. Neither is ever a fact about a person.
