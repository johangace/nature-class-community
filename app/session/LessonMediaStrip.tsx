import { PhotoCredit } from "@/app/PhotoCredit";
import type { LessonMediaItem } from "@/lib/lesson/media";

/**
 * Exported for the runner's full-bleed viewer (#375): the evidence wording is
 * the honesty tier, and two spellings of one claim on two surfaces showing the
 * same photograph is how vocabularies fork.
 */
export function evidenceLabel(item: LessonMediaItem): string {
  if (item.kind === "hyperlocal" && item.radiusKm !== null) {
    return `Recorded within ${item.radiusKm} km`;
  }
  // A subject photograph, fetched because nothing was recorded near the school.
  // It says what it is rather than what it is not: this is a picture of the
  // thing, and the row it sits in never claims anything was seen here.
  if (item.locality) return "What it looks like";
  return "Photo reference";
}

/** A compact source-backed photo row, never a second content card system. */
export function LessonMediaStrip({
  items,
  heading,
}: {
  items: LessonMediaItem[];
  heading: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="lesson-media" aria-labelledby="lesson-media-heading">
      <div className="lesson-media-head">
        <h2 id="lesson-media-heading">{heading}</h2>
        <p>Open a photograph to check its source.</p>
      </div>
      <ul className="lesson-media-list">
        {items.map((item) => (
          <li key={`${item.id}:${item.sourceUrl}`}>
            <a
              className="lesson-media-image"
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open source for ${item.name}`}
            >
              <img src={item.photo.url} alt={item.name} loading="lazy" decoding="async" />
            </a>
            <div className="lesson-media-caption">
              <span>{evidenceLabel(item)}</span>
              <strong>{item.name}</strong>
              {item.scientificName && <em>{item.scientificName}</em>}
              {/*
                What it IS, for the moment a child asks and the teacher has
                thirty of them waiting. Expands in place rather than opening a
                page, per R14: the runner does not send her somewhere else.
                Closed by default, because she asked for a lesson, not a
                reference book, and it costs a tap when she wants it.
              */}
              {item.definition && (
                <details className="lesson-media-what">
                  <summary>What is a {item.name.toLowerCase()}?</summary>
                  <p>{item.definition}</p>
                  <p className="lesson-media-whence">
                    {"From "}
                    <a
                      href={item.definitionSource ?? item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wikipedia
                    </a>
                  </p>
                </details>
              )}
              <PhotoCredit asset={item.photo} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
