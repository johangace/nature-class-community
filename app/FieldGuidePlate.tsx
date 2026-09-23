/**
 * The field-guide plate: ink line-work on paper, in the register of a plate in
 * a field guide. Drawn rather than photographed, and it says so.
 *
 * It is the FLOOR under every species picture in this product, not a branch we
 * take when `photoUrl` is null. Portraits draw it and lay a photograph on top;
 * a photograph that never loads uncovers it again. That is what keeps a dead
 * iNaturalist URL, a school network blocking the photo host, or a bad
 * connection from rendering the browser's broken-image box — the grey box we
 * swore never to ship, arriving by the back door.
 *
 * Extracted from app/CastFace.tsx so the onboarding bloom (a client component)
 * and the card surfaces (server components) draw the SAME plate. Two copies of
 * this would drift, and the drift would only ever be visible on the surfaces
 * where a photograph had already failed — which is to say, nowhere anyone was
 * looking.
 *
 * ── THE FRAME WAS EMPTY, AND THAT WAS THE BUG (#250, #304) ─────────────────
 *
 * Until now this drew a rectangle, two rules and four corner ticks, and stopped
 * there, on the reasoning that "a drawn silhouette per species would be a
 * picture we do not have". The reasoning is right and the result was wrong:
 * every species without a releasable photograph rendered as an empty bordered
 * box captioned "drawn, not photographed", which is the grey box this component
 * exists to prevent, wearing a caption. Johan, 17 August, looking at two of
 * them side by side: "it is broken.... and worse experience".
 *
 * So the plate now carries a mark, and the mark is chosen by ICONIC TAXON, not
 * by species. That is the whole distinction that keeps it honest: it does not
 * claim to show you this coot, it shows you that this is a bird, which is
 * exactly what the plate section of a real field guide does before you turn to
 * the species page. `iconicTaxon` already rides every recorded member from
 * Pointmoon (`lib/cast/member.ts`), and where it is absent — the regional
 * phenology tier carries none — the plate falls back to the frame's own leaf
 * mark rather than guessing at a kingdom.
 *
 * "Drawn, not photographed" stays true, and stays on the plate.
 */

/**
 * One mark per iconic taxon, in the frame's own ink. Deliberately few, and
 * deliberately generic within each: a wing, a six-legged body, a leaf. Nothing
 * here identifies a species, and nothing here should ever be drawn well enough
 * to be mistaken for a photograph of one.
 *
 * The keys are Pointmoon's own vocabulary, verified against a live London
 * payload rather than assumed: Aves, Insecta, Arachnida, Plantae, Fungi,
 * Mammalia, Amphibia, Reptilia, Mollusca, Actinopterygii.
 */
/**
 * The fallback, and the plate's own default: a leaf.
 *
 * Named separately rather than reached for as `MARKS.Plantae`, because under
 * `noUncheckedIndexedAccess` every lookup in that record is `string |
 * undefined` — including the one meant to be the floor, which would leave the
 * fallback itself possibly absent and the plate possibly empty again.
 */
const LEAF =
  "M50 84 v-22 M50 62 c-16 0 -24 -12 -24 -24 c14 -4 24 2 24 24 z M50 62 c16 -2 24 -14 24 -28 c-14 -2 -24 6 -24 28 z M50 68 c-8 0 -12 -5 -12 -10 c7 -2 12 2 12 10 z";

const MARKS: Record<string, string> = {
  // A bird perched and facing left, which is the field guide's own convention:
  // rounded head, body, folded wing, tail out to the right, two legs, and a
  // beak that points somewhere. The first attempt was a body with a spike on
  // it and read as a fig with a stem.
  Aves:
    "M36 44 c0 -9 8 -16 18 -16 c10 0 18 7 18 16 c0 4 -1 7 -3 10 c9 6 14 16 14 28 h-54 c0 -12 6 -23 15 -29 c-2 -3 -8 -5 -8 -9 z M36 42 l-14 4 l13 5 M46 68 c7 6 16 7 24 3 M83 82 l13 7 l-13 3 M48 82 v10 M62 82 v10",
  // Six legs, two antennae, a segmented body seen from above.
  Insecta:
    "M40 38 c0 -6 4 -10 10 -10 c6 0 10 4 10 10 c0 5 -3 8 -6 10 M40 48 h20 M38 58 c0 -6 5 -10 12 -10 c7 0 12 4 12 10 v14 c0 8 -5 14 -12 14 c-7 0 -12 -6 -12 -14 z M38 54 l-14 -8 M62 54 l14 -8 M38 64 l-16 0 M62 64 l16 0 M38 74 l-14 9 M62 74 l14 9 M46 30 l-6 -10 M54 30 l6 -10",
  // Eight legs around a round body.
  Arachnida:
    "M50 44 c8 0 13 6 13 14 c0 9 -5 16 -13 16 c-8 0 -13 -7 -13 -16 c0 -8 5 -14 13 -14 z M37 52 l-14 -10 M37 58 l-16 -2 M37 66 l-15 6 M37 72 l-12 12 M63 52 l14 -10 M63 58 l16 -2 M63 66 l15 6 M63 72 l12 12",
  // A leaf with a midrib and two veins, on a stem.
  Plantae: LEAF,
  // A cap and stalk, with gills.
  Fungi:
    "M28 52 c0 -13 10 -22 22 -22 c12 0 22 9 22 22 z M28 52 h44 M44 52 v22 c0 5 2 8 6 8 c4 0 6 -3 6 -8 v-22 M36 52 v6 M50 52 v6 M64 52 v6",
  // A four-legged body with an ear and a tail.
  Mammalia:
    "M26 66 c0 -10 8 -16 20 -16 h14 c10 0 16 5 16 13 c0 8 -6 13 -16 13 h-18 c-10 0 -16 -4 -16 -10 z M72 63 l8 -8 l0 -10 l-8 8 M30 76 v8 M44 76 v8 M60 76 v8 M70 76 v8 M26 66 l-8 4",
  // A smooth-backed body with a webbed foot.
  Amphibia:
    "M32 62 c0 -12 8 -20 18 -20 c10 0 18 8 18 20 c0 12 -8 18 -18 18 c-10 0 -18 -6 -18 -18 z M42 46 c-2 -4 0 -8 4 -8 M58 46 c2 -4 0 -8 -4 -8 M32 66 l-12 8 M32 70 l-10 12 M68 66 l12 8 M68 70 l10 12",
  // A lizard from above: head, body, four splayed legs, a tail curling off.
  // The first attempt drew a lens with spikes along it, which rendered as an
  // EYE WITH LASHES, and shipped that under both Hermann's Tortoise and
  // Erhard's Wall Lizard.
  Reptilia:
    "M50 22 c-6 0 -11 5 -11 11 c0 4 2 7 5 9 c-7 5 -11 14 -11 24 c0 11 8 20 17 20 c9 0 17 -9 17 -20 c0 -10 -4 -19 -11 -24 c3 -2 5 -5 5 -9 c0 -6 -5 -11 -11 -11 z M50 86 c0 7 5 12 12 12 c6 0 10 -4 10 -10 M38 50 l-16 -9 M38 72 l-16 9 M62 50 l16 -9 M62 72 l16 9",
  // A coiled shell.
  Mollusca:
    "M56 62 c0 -6 -5 -11 -11 -11 c-8 0 -14 6 -14 14 c0 10 8 18 19 18 c14 0 24 -11 24 -25 c0 -17 -14 -30 -32 -30 M32 78 l-12 6",
  // A fish: body, tail, fin.
  Actinopterygii:
    "M22 62 c10 -12 26 -18 40 -18 c10 0 16 4 20 10 c-4 8 -12 14 -22 17 c-14 4 -28 0 -38 -9 z M80 54 l10 -8 v24 l-10 -8 M44 46 l4 -10 M40 71 l4 8 M34 58 h4",
};

/** The mark for a taxon, or the plate's own leaf when we do not know. */
function markFor(iconicTaxon: string | null | undefined): string {
  const key = iconicTaxon?.trim();
  return (key ? MARKS[key] : undefined) ?? LEAF;
}

export function FieldGuidePlate({
  name,
  iconicTaxon = null,
  compact = false,
}: {
  name: string;
  /**
   * Pointmoon's iconic taxon for this member, when it has one. Chooses the
   * mark. The regional phenology tier carries none and gets the leaf, which is
   * honest: we know it is in season here, not what kingdom the author meant.
   */
  iconicTaxon?: string | null;
  /**
   * The circle-sized variant: the drawn frame alone, no words.
   *
   * The full plate carries the species name and "drawn, not photographed",
   * which needs a 4/5 portrait to breathe. Inside a 72px circle that text has
   * nowhere to go and spills out of the mark — the exact failure this
   * component exists to prevent, in a new costume. In the circle the name is
   * already rendered beside the picture, so the words would be a repetition
   * even if they fitted.
   */
  compact?: boolean;
}) {
  return (
    <span
      className={`cast-plate${compact ? " cast-plate-compact" : ""}`}
      aria-hidden="true"
    >
      {/* THE FRAME AND THE MARK ARE TWO ELEMENTS, NOT ONE.

          They were one, and the drawing landed on top of the words: the frame
          fills the portrait, the caption is centred in it, and a mark centred
          in the same box wrote a bird straight through "drawn, not
          photographed". Splitting them lets the mark be placed in the space
          ABOVE the caption on the full plate and dead centre in the compact
          circle, which is the only difference between the two and now the only
          rule that differs. */}
      <svg
        className="cast-plate-rule"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="presentation"
        focusable="false"
      >
        <rect className="cast-plate-frame" x="6" y="6" width="88" height="88" rx="3" />
        <path className="cast-plate-frame" d="M6 24 h88 M6 78 h88" />
        <path className="cast-plate-frame" d="M16 15 h10 M74 15 h10" />
      </svg>
      {/* The mark. Never filled: this is line-work on paper, and a filled
          silhouette starts to read as a logo rather than as a drawing. */}
      <svg
        className="cast-plate-drawing"
        viewBox="0 0 100 100"
        role="presentation"
        focusable="false"
      >
        <path className="cast-plate-mark" d={markFor(iconicTaxon)} />
      </svg>
      {!compact && (
        <>
          <span className="cast-plate-name">{name}</span>
          <span className="cast-plate-note">drawn, not photographed</span>
        </>
      )}
    </span>
  );
}
