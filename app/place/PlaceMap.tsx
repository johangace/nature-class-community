import {
  MAP_ATTRIBUTION,
  MAP_ATTRIBUTION_HREF,
  mapMosaic,
} from "@/lib/outside/static-map";

/**
 * The picture beside the words (#876). A still map around a saved position,
 * with a ring the size of the rounding the store applies rather than a pin
 * claiming a point we do not hold.
 *
 * A server component: tiles are images and the arithmetic is done once, so
 * this ships no JavaScript to the teacher's iPad. It renders wherever a
 * position has just been set or is being reviewed: the class card on
 * /classes now, the location step of first run and Today's context line
 * once those surfaces land their own changes.
 *
 * The caption says which place and how coarse. "Somewhere in the ring" is
 * the true sentence; "here" would not be.
 */
export function PlaceMap({
  lat,
  lng,
  label,
  zoom,
  className,
  compact = false,
}: {
  lat: number;
  lng: number;
  /** The place in the teacher's own words, or the name we resolved for it. */
  label: string;
  zoom?: number;
  className?: string;
  /**
   * A thumbnail beside a place card (#913): the tiles and the ring, no
   * caption. The card names the place and carries the attribution in its
   * own text, where it reads as one line instead of three under a stamp.
   */
  compact?: boolean;
}) {
  const map = mapMosaic({
    lat,
    lng,
    zoom,
    template: process.env.NEXT_PUBLIC_MAP_TILE_URL || undefined,
  });

  return (
    <figure
      className={["place-map", compact ? "place-map-compact" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="place-map-tiles" role="img" aria-label={`Map around ${label}`}>
        {map.tiles.map((tile) => (
          // Plain <img>, not next/image: a map tile is a third-party bitmap at
          // a fixed size, and the optimiser would proxy it through our own
          // origin for no gain.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            style={{ left: `${tile.left}%`, top: `${tile.top}%`, width: `${tile.size}%` }}
          />
        ))}
        <span
          className="place-map-ring"
          aria-hidden="true"
          style={{ width: `${map.ringPercent}%`, height: `${map.ringPercent}%` }}
        />
      </div>
      {!compact && (
        <figcaption className="place-map-caption">
          <span>
            {label}. The saved position is somewhere in the ring, about 100 metres across.
          </span>{" "}
          <a href={MAP_ATTRIBUTION_HREF} rel="noreferrer" target="_blank">
            {MAP_ATTRIBUTION}
          </a>
        </figcaption>
      )}
    </figure>
  );
}
