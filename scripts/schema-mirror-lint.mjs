#!/usr/bin/env node
/**
 * Schema mirror lint — the published JSON Schema must say what zod says (#662).
 *
 * WHY THIS EXISTS
 *
 * `schema/pack.ts` (zod) is the source of truth: it is what the app parses
 * packs with. `schema/pack.schema.json` is a MIRROR of it, written by hand,
 * `additionalProperties: false` on every object, and published for anything
 * that is not this app — an authoring tool, an editor, a partner writing a pack
 * outside the repo.
 *
 * A hand-written mirror of a schema that keeps growing drifts, and it drifts
 * SILENTLY: nothing in this repo parsed a pack with the JSON Schema, so a field
 * added to zod and forgotten in the mirror broke nobody's build and failed no
 * test. It only breaks the outside author, who gets "additionalProperties" on a
 * field that is perfectly legal — and who is exactly the person least able to
 * tell that the mirror is wrong rather than their pack.
 *
 * #662 was filed for ONE missing field (`phase.materialPurpose`, nc#403). Run
 * against the tree that ticket was written on, this check found 27 field-level
 * disagreements across EIGHT distinct field names: `pack.collection`, and on a
 * session `validity`, `spaceNeededVariants`, `settle` and `standards`, and the
 * two blockBase fields `habitatVariants` and `adaptsToPlace` on every one of
 * the eleven block kinds. That is the shape of the problem — the named field is
 * never the only one, because whatever process missed it missed everything else
 * added the same way, and a drift report that stops at the first instance is
 * how the second one survives.
 *
 * `tests/unit/work-phase-contract.spec.ts` already asserted that a handful of
 * NAMED fields appear in the mirror. That is why this drifted anyway: a test
 * that names fields can only ever protect the fields somebody thought to name.
 * This compares KEY SETS, so it protects the field nobody thought of — which is
 * always the one that goes missing.
 *
 * WHAT IT DOES
 *
 * Walks the two schemas in parallel from their roots and, at every object,
 * compares:
 *
 *   - the property key sets (either direction: missing from the mirror, and
 *     invented by the mirror)
 *   - which of those keys are required
 *   - enum member sets, so a new `materialPurpose` value drifts no more quietly
 *     than a new field would
 *   - what each side does with a key nobody declared: zod's `.strict()` /
 *     `.catchall()` against the mirror's `additionalProperties`
 *   - a record's KEY and VALUE types, against the mirror's `propertyNames` and
 *     `additionalProperties`
 *
 * Every finding NAMES THE FIELD, at its full path, because "the schemas
 * disagree" sends the next person back to a 320-line diff.
 *
 * A shape it does not know how to compare is a FAILURE, not a skip. Skipping is
 * how the mirror got here: the way this check rots is somebody adding a zod
 * construct it walks straight past, so it stops instead and asks to be taught.
 *
 * That promise had one hole, and it was in the walk rather than in the
 * `default:` branch (#737). `case "record"` returned early beside the scalars,
 * so `z.record(z.string(), z.object({ text, sneaked }).strict())` — a two-field
 * object where the mirror still said `{"type":"string"}` — printed "matches"
 * and exited 0. `def.catchall` was the same fault on the object node: the only
 * unknown-key policy this check could see was the mirror's half of it, so a
 * `z.object()` that silently STRIPS an unknown key read identically to a
 * `.strict()` one that rejects it. Both are walked now, and the rule the fix
 * follows is the one the hole broke: a node this walk terminates on must have
 * NOTHING hanging off it. A kind whose def holds another schema is a kind to
 * descend into, or to fail on — never to return early from.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not compare constraints — `minLength`, `exclusiveMinimum`, the
 * `pattern` standing in for zod's `stretch` refinement, or the `allOf`/`if`
 * clause standing in for the childTask superRefine. Those are a hand-written
 * TRANSLATION of a zod refinement rather than a mirror of a field, they have no
 * mechanical equivalent to compare against, and a check that pretended to
 * compare them would be asserting something it cannot see. Field sets, required
 * sets and enum members are the part that is mechanically checkable, and are
 * where every drift found so far has actually been.
 *
 * Two MODIFIERS sit with the constraints rather than with the field sets, and
 * are named here so they are a recorded gap rather than a discovery — and
 * carry a ticket, #742, rather than only a comment. Neither is a skip in the
 * #737 sense; the schema underneath is walked either way:
 *
 *   - NULLABILITY. `unwrap` peels `.nullable()` and compares what is inside it;
 *     nothing asks the mirror to admit `null` as well. No field in `pack.ts` is
 *     nullable today, and how this mirror would say so (`type: [x, "null"]`, an
 *     `anyOf`, an `enum` carrying null) is not settled.
 *   - A PIPE's INPUT. `unwrap` follows `def.out`, so `z.pipe(a, b)` is compared
 *     against `b` while an outside author writes `a`. `.transform()` — the pipe
 *     anyone actually writes — puts a `transform` node in `out` and fails on the
 *     `default:` branch below, loudly, which is why this has never bitten.
 *
 *   node --import tsx scripts/schema-mirror-lint.mjs   (npm run lint:schema-mirror)
 *
 * SCOPE: NEITHER. It reads two schema files and quotes no founder prose; it
 * writes nothing. See `scripts/authorship.mjs` for why every check says so.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { packSchema } from "../schema/pack.ts";

const MIRROR_URL = new URL("../schema/pack.schema.json", import.meta.url);

/**
 * PLACES THE MIRROR IS DELIBERATELY STRICTER THAN ZOD, and why.
 *
 * Same posture as the `expect: "green"` pins in guard-mutation-check.mjs and
 * GRANDFATHERED in register-lint.mjs: the list is allowed to SHRINK and not to
 * grow quietly. Each entry is checked both ways — an entry whose drift is no
 * longer there fails as STALE, so nobody can leave a divergence recorded after
 * the reason for it has gone.
 *
 * An entry belongs here only when the mirror rejecting something zod accepts is
 * CORRECT for an outside author — that is, when some other guard in this repo
 * rejects the same thing at authoring time. It is not a place to park a field
 * somebody has not got round to mirroring yet: that is the drift this file
 * exists to catch, and burying it here would make this check the thing it was
 * written to prevent.
 */
export const DIVERGENCES = [
  {
    path: "pack.sessions[].phases[].blocks[][type=demo].abilityVariants",
    why:
      "a demo block's text is an ARRAY of steps, so a field that rewrites a " +
      "block's primary text has nothing to rewrite (#252). zod keeps the field " +
      "because every other consumer reads it off the block union without " +
      "narrowing; scripts/validate-packs.mjs rejects it on demo blocks at " +
      "authoring time. The mirror rejecting it too tells an outside author the " +
      "same thing this repo's own author is told, at the same moment.",
  },
  {
    path: "pack.sessions[].phases[].blocks[][type=demo].habitatVariants",
    why: "the other half of the same #252 rule, rejected by the same check.",
  },
];

/** Every disagreement found, each one naming its field and its path. */
const findings = [];

const report = (path, message) => findings.push({ path, message });

// ---------------------------------------------------------------------------
// zod side
// ---------------------------------------------------------------------------

/**
 * Peel the wrappers that carry no fields of their own — `optional`, `nullable`,
 * `default`, `lazy`, `readonly`, and a pipe's output — down to the node that
 * actually has a shape. `optional` is remembered by the caller before peeling,
 * because whether a key is required is one of the things being compared.
 */
/**
 * `z.lazy(() => …)` re-runs its getter on every call and hands back a NEW
 * schema instance each time, so a recursive schema (`phase.conditionVariants`
 * holds whole phases) has no fixed point to stop a walk on. Resolve each lazy
 * node once and keep the answer, which gives the cycle guard below something
 * stable to recognise.
 */
let lazyCache = new WeakMap();
function resolveLazy(node) {
  if (!lazyCache.has(node)) lazyCache.set(node, node._zod.def.getter());
  return lazyCache.get(node);
}

function unwrap(node) {
  let current = node;
  for (;;) {
    const def = current?._zod?.def;
    switch (def?.type) {
      case "optional":
      case "nullable":
      case "default":
      case "prefault":
      case "readonly":
      case "nonoptional":
      case "catch":
        current = def.innerType;
        break;
      case "lazy":
        current = resolveLazy(current);
        break;
      case "pipe":
        current = def.out;
        break;
      default:
        return current;
    }
  }
}

/** Is this key optional in zod (so: legitimately absent from `required`)? */
function isOptional(node) {
  const def = node?._zod?.def;
  if (!def) return false;
  if (def.type === "optional" || def.type === "default" || def.type === "prefault") return true;
  if (def.type === "lazy") return isOptional(resolveLazy(node));
  if (def.type === "pipe") return isOptional(def.out);
  if (def.type === "nullable" || def.type === "readonly" || def.type === "catch") {
    return isOptional(def.innerType);
  }
  return false;
}

/** The literal a discriminated-union member is keyed on, for member matching. */
function literalValue(node) {
  const def = unwrap(node)?._zod?.def;
  if (def?.type !== "literal") return undefined;
  return def.values?.[0];
}

// ---------------------------------------------------------------------------
// JSON Schema side
// ---------------------------------------------------------------------------

let mirror;

/** Follow a local `$ref`, which is the only kind this schema uses. */
function deref(node, path) {
  if (!node || typeof node.$ref !== "string") return node;
  if (!node.$ref.startsWith("#/")) {
    report(path, `$ref "${node.$ref}" is not local; this check can only follow local refs`);
    return undefined;
  }
  let target = mirror;
  for (const segment of node.$ref.slice(2).split("/")) {
    target = target?.[segment];
  }
  if (!target) report(path, `$ref "${node.$ref}" resolves to nothing`);
  return target;
}

// ---------------------------------------------------------------------------
// The parallel walk
// ---------------------------------------------------------------------------

const seen = new Set();
let nodeIds = new WeakMap();
let nextId = 0;
const idOf = (node) => {
  if (!nodeIds.has(node)) nodeIds.set(node, ++nextId);
  return nodeIds.get(node);
};

function compare(jsonNode, zodNode, path) {
  const json = deref(jsonNode, path);
  const zod = unwrap(zodNode);
  if (!json || !zod) return;

  // `phase` refers to itself through conditionVariants. Walk each pairing once.
  const key = `${idOf(json)}:${idOf(zod)}`;
  if (seen.has(key)) return;
  seen.add(key);

  const kind = zod._zod.def.type;

  switch (kind) {
    case "object":
      compareObject(json, zod, path);
      return;
    case "union":
      compareUnion(json, zod, path);
      return;
    case "array":
      compareArray(json, zod, path);
      return;
    case "enum":
      compareEnum(json, zod, path);
      return;
    case "literal":
      compareLiteral(json, zod, path);
      return;
    case "record":
      compareRecord(json, zod, path);
      return;
    case "string":
    case "number":
    case "boolean":
      // TRUE scalars: a `string` node's def holds constraints (`minLength`,
      // `pattern`), never another schema, so there is nothing under it left
      // unwalked. `record` used to sit in this list on the grounds that it too
      // "carries no field set to disagree about" — which was a fact about the
      // one record here rather than about records, and cost the check its whole
      // promise (#737). Nothing joins this list unless its def is a dead end.
      return;
    default:
      report(
        path,
        `zod node of kind "${kind}" is not one this check knows how to compare. ` +
          `Teach scripts/schema-mirror-lint.mjs to compare it rather than letting ` +
          `it walk past a shape it cannot see.`
      );
  }
}

function compareObject(json, zod, path) {
  if (!json.properties || typeof json.properties !== "object") {
    report(path, "mirror node has no `properties` where zod has an object");
    return;
  }

  const zodShape = zod._zod.def.shape;
  const zodKeys = Object.keys(zodShape);
  const jsonKeys = Object.keys(json.properties);

  for (const field of zodKeys) {
    if (!jsonKeys.includes(field)) {
      report(
        `${path}.${field}`,
        `MISSING FROM MIRROR: zod accepts \`${field}\`, the JSON Schema does not declare it. ` +
          `Because this object is additionalProperties:false, a pack authoring \`${field}\` ` +
          `is valid to the app and REJECTED by the published schema.`
      );
    }
  }
  for (const field of jsonKeys) {
    if (!zodKeys.includes(field)) {
      report(
        `${path}.${field}`,
        `NOT IN SOURCE OF TRUTH: the JSON Schema declares \`${field}\`, zod has no such key. ` +
          `A pack authoring it validates against the published schema and is then rejected by the app.`
      );
    }
  }

  const jsonRequired = new Set(Array.isArray(json.required) ? json.required : []);
  for (const field of zodKeys) {
    if (!jsonKeys.includes(field)) continue;
    const required = !isOptional(zodShape[field]);
    if (required && !jsonRequired.has(field)) {
      report(`${path}.${field}`, `REQUIRED IN ZOD, OPTIONAL IN MIRROR: add \`${field}\` to \`required\`.`);
    }
    if (!required && jsonRequired.has(field)) {
      report(
        `${path}.${field}`,
        `OPTIONAL IN ZOD, REQUIRED IN MIRROR: the published schema rejects a pack the app accepts.`
      );
    }
  }
  for (const field of jsonRequired) {
    if (!jsonKeys.includes(field)) {
      report(`${path}.${field}`, `listed in the mirror's \`required\` but not in its \`properties\`.`);
    }
  }

  compareUnknownKeys(json, zod, path);

  for (const field of zodKeys) {
    if (!jsonKeys.includes(field)) continue;
    compare(json.properties[field], zodShape[field], `${path}.${field}`);
  }
}

/** A mirror node that is a schema rather than a `true`/`false` shorthand. */
const isSchemaNode = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * What each side does with a key NOBODY DECLARED.
 *
 * zod keeps its answer in `def.catchall`, and it has three states, not two:
 * `.strict()` puts `z.never()` there and REJECTS the key, `.catchall(schema)`
 * puts that schema there and accepts keys matching it, and a bare `z.object()`
 * leaves it undefined and STRIPS the key without a word. The mirror keeps its
 * answer in `additionalProperties`.
 *
 * Only the mirror's half used to be read, on the assumption that every object
 * here is `.strict()`. Twenty-five of the twenty-six were; `session.conditionNote`
 * was a bare `z.object()` while its mirror node said `additionalProperties:
 * false`, and nothing could see the difference (#737). That is the #662 harm
 * from the other end — an outside author told their pack is invalid over a key
 * this app accepts and drops — and it is exactly the sort of thing a check that
 * reads one side of a comparison cannot report.
 */
function compareUnknownKeys(json, zod, path) {
  const catchall = zod._zod.def.catchall;

  if (catchall === undefined) {
    report(
      path,
      "zod object is not `.strict()`, so it STRIPS an unknown key rather than rejecting it — " +
        "and `additionalProperties` can only say reject (`false`) or accept (`true`), never " +
        "strip. The mirror cannot mirror this object at all. Add `.strict()` in " +
        "schema/pack.ts, which is what every other object in it does."
    );
    return;
  }

  const kind = unwrap(catchall)._zod.def.type;

  if (kind === "never") {
    if (json.additionalProperties !== false) {
      report(
        path,
        "mirror object is not `additionalProperties: false` where zod is `.strict()`. " +
          "The mirror's whole promise is that it rejects what zod rejects."
      );
    }
    return;
  }

  if (kind === "unknown" || kind === "any") {
    if (json.additionalProperties !== true) {
      report(
        path,
        "zod accepts ANY unknown key here (a loose object) and the mirror does not say " +
          "`additionalProperties: true`. A pack the app is happy with is rejected by the " +
          "published schema."
      );
    }
    return;
  }

  if (!isSchemaNode(json.additionalProperties)) {
    report(
      path,
      `zod accepts unknown keys matching a \`${kind}\` (\`.catchall(…)\`) and the mirror gives ` +
        `them no schema (\`additionalProperties: ${JSON.stringify(json.additionalProperties)}\`). ` +
        `Mirror the catchall, or drop it from zod.`
    );
    return;
  }

  compare(json.additionalProperties, catchall, `${path}{}`);
}

/**
 * A RECORD: an open key set, one schema for every value. The mirror writes it
 * as `{ type: object, propertyNames: …, additionalProperties: … }`, so both
 * halves have somewhere to be compared, and both are compared here.
 *
 * This is #737. `case "record"` returned early beside the scalars — "open
 * records carry no field set to disagree about" — which was true of the only
 * record in this schema (`habitatVariants`, a string→string map) and false of
 * records. Change its value type to `z.object({ text, sneaked }).strict()` and
 * zod accepted a two-field object where the mirror still said
 * `{"type":"string"}`, and this check printed "matches" and exited 0.
 */
function compareRecord(json, zod, path) {
  if (json.type !== "object") {
    report(path, "mirror node is not `type: object` where zod has a record");
    return;
  }

  const { keyType, valueType } = zod._zod.def;

  // The VALUES. This mirror puts them in `additionalProperties`; a mirror that
  // used `patternProperties` for the same job is read rather than assumed away,
  // because guessing which one a hand-written mirror uses is how a walk ends up
  // comparing nothing again.
  const patterns = isSchemaNode(json.patternProperties) ? Object.values(json.patternProperties) : [];
  if (isSchemaNode(json.additionalProperties)) {
    compare(json.additionalProperties, valueType, `${path}{}`);
  } else if (patterns.length === 1) {
    compare(patterns[0], valueType, `${path}{}`);
  } else if (patterns.length > 1) {
    report(
      `${path}{}`,
      `the mirror splits this record's values across ${patterns.length} \`patternProperties\` ` +
        `and zod has ONE value type. Which mirror branch is the value type is not something ` +
        `this check can guess, so it stops: express the record with a single value schema.`
    );
  } else if (json.additionalProperties === false) {
    report(
      `${path}{}`,
      "the mirror says `additionalProperties: false` where zod has a record, so it accepts " +
        "NO entry at all where the app accepts any key. Every pack that fills this record is " +
        "invalid to the published schema."
    );
  } else {
    report(
      `${path}{}`,
      `the mirror constrains this record's VALUES not at all (\`additionalProperties: ` +
        `${JSON.stringify(json.additionalProperties)}\`) where zod requires each value to be a ` +
        `\`${unwrap(valueType)._zod.def.type}\`. A pack validating against the published schema ` +
        `is then rejected by the app.`
    );
  }

  // The KEYS. `propertyNames` is the mirror's word for them. A plain string key
  // with no `propertyNames` is not drift — JSON object keys are strings — but a
  // key type that actually RESTRICTS the keys, with nothing on the mirror side
  // saying so, is.
  const keyKind = unwrap(keyType)._zod.def.type;
  if (json.propertyNames !== undefined) {
    compare(json.propertyNames, keyType, `${path}{key}`);
  } else if (keyKind !== "string") {
    report(
      `${path}{key}`,
      `zod restricts this record's KEYS to a \`${keyKind}\` and the mirror declares no ` +
        `\`propertyNames\`, so the published schema accepts keys the app rejects.`
    );
  }
}

function compareUnion(json, zod, path) {
  const members = json.oneOf ?? json.anyOf;
  if (!Array.isArray(members)) {
    report(path, "mirror node has no `oneOf`/`anyOf` where zod has a union");
    return;
  }
  const options = zod._zod.def.options;
  const discriminator = zod._zod.def.discriminator ?? "type";

  /** The `const` a mirror member pins its discriminator to, if it pins one. */
  const memberTag = (member) => deref(member, path)?.properties?.[discriminator]?.const;

  for (const option of options) {
    const tag = literalValue(unwrap(option)._zod.def.shape?.[discriminator]);
    if (tag === undefined) {
      report(path, `union member has no literal \`${discriminator}\`; cannot pair it with a mirror member`);
      continue;
    }
    const match = members.find((member) => memberTag(member) === tag);
    if (!match) {
      report(
        `${path}[${discriminator}=${tag}]`,
        `MISSING FROM MIRROR: zod accepts a \`${tag}\` here and the JSON Schema declares no such member.`
      );
      continue;
    }
    compare(match, option, `${path}[${discriminator}=${tag}]`);
  }

  const zodTags = new Set(
    options.map((option) => literalValue(unwrap(option)._zod.def.shape?.[discriminator]))
  );
  for (const member of members) {
    const tag = memberTag(member);
    if (!zodTags.has(tag)) {
      report(
        `${path}[${discriminator}=${tag}]`,
        `NOT IN SOURCE OF TRUTH: the JSON Schema declares a \`${tag}\` member, zod's union has none.`
      );
    }
  }
}

function compareArray(json, zod, path) {
  if (json.type !== "array" || !json.items) {
    report(path, "mirror node is not an array with `items` where zod has an array");
    return;
  }
  compare(json.items, zod._zod.def.element, `${path}[]`);
}

function compareEnum(json, zod, path) {
  const zodValues = Object.values(zod._zod.def.entries);
  const jsonValues = json.enum ?? (json.const === undefined ? undefined : [json.const]);
  if (!Array.isArray(jsonValues)) {
    report(path, `mirror node declares no \`enum\` where zod has one (${zodValues.join(", ")})`);
    return;
  }
  for (const value of zodValues) {
    if (!jsonValues.includes(value)) {
      report(`${path}`, `MISSING ENUM MEMBER: zod accepts "${value}", the JSON Schema's enum does not list it.`);
    }
  }
  for (const value of jsonValues) {
    if (!zodValues.includes(value)) {
      report(`${path}`, `EXTRA ENUM MEMBER: the JSON Schema lists "${value}", zod does not accept it.`);
    }
  }
}

function compareLiteral(json, zod, path) {
  const values = zod._zod.def.values;
  if (values.length === 1) {
    if (json.const !== values[0] && !(Array.isArray(json.enum) && json.enum.includes(values[0]))) {
      report(`${path}`, `literal mismatch: zod pins "${values[0]}", the mirror pins ${JSON.stringify(json.const)}.`);
    }
    return;
  }
  compareEnum(json, { _zod: { def: { entries: Object.fromEntries(values.map((v) => [v, v])) } } }, path);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/**
 * Every disagreement the walk found, minus the ones recorded in DIVERGENCES —
 * plus a STALE finding for any recorded divergence the walk did not find, so
 * the allowlist cannot outlive its reason.
 */
export function findDrift() {
  findings.length = 0;
  seen.clear();
  nodeIds = new WeakMap();
  lazyCache = new WeakMap();
  mirror = JSON.parse(readFileSync(MIRROR_URL, "utf8"));
  compare(mirror, packSchema, "pack");

  const raw = [...findings];
  const allowed = new Set(DIVERGENCES.map((d) => d.path));
  const matched = new Set(raw.filter((f) => allowed.has(f.path)).map((f) => f.path));

  const stale = DIVERGENCES.filter((d) => !matched.has(d.path)).map((d) => ({
    path: d.path,
    message:
      `STALE DIVERGENCE: this path is recorded in DIVERGENCES as a place the mirror is ` +
      `deliberately stricter than zod, and the mirror and zod now agree there. Delete the ` +
      `entry from scripts/schema-mirror-lint.mjs — a recorded exception nobody can see the ` +
      `effect of is how an allowlist turns into a list of things nobody re-checked.`,
  }));

  return [...raw.filter((f) => !allowed.has(f.path)), ...stale];
}

function main() {
  const drift = findDrift();

  if (drift.length === 0) {
    console.log(
      `schema-mirror-lint: schema/pack.schema.json matches schema/pack.ts ` +
        `(${DIVERGENCES.length} recorded divergence${DIVERGENCES.length === 1 ? "" : "s"}).`
    );
    return 0;
  }

  console.error(
    `schema-mirror-lint: schema/pack.schema.json has drifted from schema/pack.ts ` +
      `(${drift.length} ${drift.length === 1 ? "disagreement" : "disagreements"}).\n` +
      `zod is the source of truth; the mirror is the thing to fix.\n`
  );
  for (const { path, message } of drift) {
    console.error(`  ${path}\n    ${message}\n`);
  }
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main());
}
