import type { SeasonalObservations as SeasonalReport } from "@/lib/outside/seasonal-observations";

/** Teacher preparation: compare a dated report with what the class finds itself. */
export function SeasonalObservations({ report, plannedDay }: { report?: SeasonalReport | null; plannedDay?: string }) {
  if (!report?.records.length) return null;
  return (
    <section className="brief-block" aria-labelledby="seasonal-observations-heading">
      <h2 id="seasonal-observations-heading" className="brief-heading">Dated seasonal observations</h2>
      <p>These reports come from monitored sites within 5 km of this place. They describe those sites on the dates shown.</p>
      {plannedDay && <p>Use them as a comparison when preparing for {plannedDay}. They do not predict what the class will find that day.</p>}
      <ul>
        {report.records.map((record) => (
          <li key={record.observationId}>
            <p><strong>{record.commonName ?? record.scientificName}</strong> ({record.scientificName}): {record.phenophase}. {record.status === "present" ? "Reported present" : record.status === "absent" ? "Reported absent" : "Reported status uncertain"} on <time dateTime={record.observedOn}>{record.observedOn}</time>.</p>
            <p>{record.distanceKm.toFixed(1)} km from this place · {record.datasetName}, site {record.siteId} · {record.individualId === null ? "site-level report" : `monitored individual ${record.individualId}`} · observer report</p>
          </li>
        ))}
      </ul>
      <p>Compare a matching species at your own site. Note what you observe and the date, then return to the same spot.</p>
      <details>
        <summary>Sources and attribution</summary>
        <p>{report.attribution}</p>
        <p><a href={report.sourceUrl} target="_blank" rel="noreferrer">USA-NPN observation records</a> · <a href={report.termsUrl} target="_blank" rel="noreferrer">CC BY 4.0 and source terms</a></p>
        {report.citations.map((citation) => <p key={citation}>{citation}</p>)}
        {report.truncated && <p>This is a selection from a larger set of reports.</p>}
      </details>
    </section>
  );
}
