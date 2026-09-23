import type { CoastalTides as Reference } from "@/lib/outside/coastal-tides";
const time = (at: string, timezone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(at));
export function CoastalTides({ reference }: { reference?: Reference | null }) {
  if (!reference) return null;
  return <section className="brief-block" aria-labelledby="coastal-tides-heading">
    <h2 id="coastal-tides-heading" className="brief-heading">{reference.station.name} station tides: {reference.localDate}</h2>
    <p>You selected NOAA station {reference.station.id}, {reference.station.name}. These are station references, not water levels at your school or a guarantee of shore access.</p>
    {reference.predictions && <>
      <h3>Predicted high and low tides</h3>
      <p>Times are for {reference.station.name} ({reference.station.timezone}). Heights are metres above mean lower low water (MLLW), datum epoch {reference.station.datumEpoch}.</p>
      <ul>{reference.predictions.events.map((event) => <li key={event.at}>{event.type === "high" ? "High" : "Low"} tide: <time dateTime={event.at}>{time(event.at, reference.station.timezone)}</time>, {event.heightMeters.toFixed(2)} m.</li>)}</ul>
      <p>Compare the predicted water levels before discussing what changes between high and low tide. Plan any shoreline visit using the site's own access advice.</p>
      <p><a href={reference.predictions.sourceUrl} target="_blank" rel="noreferrer">NOAA predictions for this date</a></p>
    </>}
    {reference.measured && <p>Separate station measurement: {reference.measured.heightMeters.toFixed(2)} m above MLLW at <time dateTime={reference.measured.observedAt}>{time(reference.measured.observedAt, reference.station.timezone)}</time> ({reference.measured.quality}). <a href={reference.measured.sourceUrl} target="_blank" rel="noreferrer">Measurement source</a></p>}
    <p>{reference.attribution} <a href={reference.termsUrl} target="_blank" rel="noreferrer">Source terms and preliminary-data notes</a>.</p>
  </section>;
}
