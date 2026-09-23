import type { DisplayPhotoAsset } from "@/lib/cast/member";

/**
 * Licences we have a house spelling for. Anything else prints as it arrived.
 *
 * This was a `Record<DisplayPhotoAsset["license"], string>` holding exactly
 * `cc0` and `cc-by`, from when those were the only two licences that could
 * reach a surface. When the licence gate came off, the type widened to string
 * and the lookup silently started returning undefined, so every `cc-by-sa`
 * photograph rendered its credit with an empty licence beside it. A map is a
 * gate wearing different clothes; this one falls through instead.
 */
const LICENSE_LABEL: Record<string, string> = {
  cc0: "CC0",
  "cc-by": "CC BY",
  "cc-by-sa": "CC BY-SA",
  "cc-by-nc": "CC BY-NC",
  "cc-by-nd": "CC BY-ND",
  "cc-by-nc-sa": "CC BY-NC-SA",
  "public domain": "Public domain",
};

function licenseLabel(license: string): string | null {
  const key = license.trim().toLowerCase();
  if (!key || key === "unstated") return null;
  return LICENSE_LABEL[key] ?? license.trim();
}

/**
 * The same credit as one plain string, for a surface that sets its own type.
 *
 * The component below is an inline-flex chip with its own weight, colour and
 * centring, which is right inside a 72px face and wrong inside a sentence.
 * Today's window puts the credit at the head of the claim line, in the claim's
 * own type. Exported from here rather than re-derived there, because the house
 * spellings of the licences are the thing that must not fork: two tables would
 * be two ways to spell CC BY-NC-SA on two surfaces showing the same picture.
 *
 * Null when neither a byline nor a licence travelled, which is now possible
 * (Johan, 2026-08-17: "all photos no gates") and renders as no credit at all
 * rather than as furniture saying we do not know.
 */
export function photoCreditText(asset: DisplayPhotoAsset): string | null {
  const who = (asset.creator || asset.attribution || "").trim();
  const license = licenseLabel(asset.license ?? "");
  return [who, license].filter(Boolean).join(", ") || null;
}

/**
 * The visible rights receipt, wherever one travelled.
 *
 * Credit and licence are no longer a condition of showing a photograph
 * (Johan, 2026-08-17: "all photos no gates"), so this now has to cope with a
 * picture that has neither. It renders what exists and nothing where nothing
 * came: a missing byline is not worth a line of furniture saying so, and an
 * absent source page is not worth a dead link.
 */
export function PhotoCredit({
  asset,
  className = "",
}: {
  asset: DisplayPhotoAsset;
  className?: string;
}) {
  const who = (asset.creator || asset.attribution || "").trim();
  const license = licenseLabel(asset.license ?? "");
  if (!who && !license) return null;

  const body = (
    <>
      {who && <span>{who}</span>}
      {who && license && <span aria-hidden="true"> · </span>}
      {license && <span>{license}</span>}
    </>
  );

  const fullCredit = photoCreditText(asset) ?? undefined;
  const classes = `photo-credit${className ? ` ${className}` : ""}`;

  // No source page, no link. The credit still shows.
  if (!asset.sourceUrl) return <span className={classes} title={fullCredit}>{body}</span>;

  return (
    <a className={classes} title={fullCredit} href={asset.sourceUrl} target="_blank" rel="noreferrer">
      {body}
      <span className="sr-only">. Open image source and licence.</span>
    </a>
  );
}
