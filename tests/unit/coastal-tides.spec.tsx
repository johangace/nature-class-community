import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseCoastalTides } from "@/lib/outside/coastal-tides";
import { CoastalTides } from "@/app/outside/CoastalTides";
const now = Date.parse("2026-09-07T16:00:00Z");
const query = { lat: 42.3, lng: -71.8, stationId: "8443970", date: "2026-09-08", now };
function fixture() { return {
  source: "noaa-coops", scope: "station-reference-only", silent: false, center: { latitude: 42.3, longitude: -71.8 }, localDate: query.date, selectedBy: "caller", stationDistanceKm: 62,
  station: { id: "8443970", name: "Boston", latitude: 42.35389, longitude: -71.05028, timezone: "America/New_York", datum: "MLLW", datumEpoch: "1983-2001", units: "m", metadataRetrievedAt: new Date(now).toISOString(), metadataUrl: "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8443970.json?expand=details,datums&units=metric" },
  attribution: "NOAA NOS CO-OPS", license: "US-government-public-domain", termsUrl: "https://tidesandcurrents.noaa.gov/disclaimers.html",
  predictions: { silent: false, evidenceKind: "prediction", issuedAt: null, issuedAtStatus: "not-published", retrievedAt: new Date(now).toISOString(), validDate: query.date, window: { startAt: "2026-09-08T04:00:00Z", endAt: "2026-09-09T04:00:00Z" }, sourceUrl: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8443970&datum=MLLW&units=metric&time_zone=gmt&product=predictions", ttlMinutes: 60, events: [{ at: "2026-09-08T07:08:00Z", heightMeters: 0.054, type: "low" }, { at: "2026-09-08T13:25:00Z", heightMeters: 2.82, type: "high" }] },
  measured: { silent: true, reason: "not-current-day" }
}; }
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });
it("renders dated Boston predictions in station time with datum and source", () => {
 const reference = parseCoastalTides(fixture(), query); expect(reference).not.toBeNull();
 const html = renderToStaticMarkup(<CoastalTides reference={reference}/>);
 expect(html).toContain("03:08"); expect(html).toContain("09:25"); expect(html).toContain("2.82 m"); expect(html).toContain("Predicted high and low tides"); expect(html).toContain("not water levels at your school"); expect(html).toContain("1983-2001"); expect(html).not.toContain("Separate station measurement");
});
it("silences wrong place, day, station, datum, stale and malformed windows", () => {
 const original=fixture();
 for(const value of [{...original,center:{latitude:0,longitude:0}},{...original,localDate:"2026-09-09"},{...original,station:{...original.station,datum:"STND"}},{...original,predictions:{...original.predictions,window:{startAt:"2026-09-08T00:00:00Z",endAt:"2026-09-09T00:00:00Z"}}}]) expect(parseCoastalTides(value,query)).toBeNull();
 expect(parseCoastalTides(original,{...query,stationId:"999"})).toBeNull(); expect(parseCoastalTides(original,{...query,now:now+3600000})).toBeNull(); expect(renderToStaticMarkup(<CoastalTides reference={null}/>)).toBe("");
});
it("accepts station-local 23-hour DST day and rejects out-of-day events", () => {
 const value=fixture(); value.localDate="2026-03-08"; value.predictions.validDate=value.localDate;
 value.predictions.window={startAt:"2026-03-08T05:00:00Z",endAt:"2026-03-09T04:00:00Z"}; value.predictions.events=[{at:"2026-03-08T13:00:00Z",heightMeters:2,type:"high"}];
 expect(parseCoastalTides(value,{...query,date:value.localDate})).not.toBeNull(); value.predictions.events[0]!.at="2026-03-09T04:00:00Z"; expect(parseCoastalTides(value,{...query,date:value.localDate})).toBeNull();
});
it("uses explicit opt-in on the one client and preserves fresh predictions through thin observation fallback", async () => {
 vi.setSystemTime(now); vi.stubEnv("POINTMOON_FIXTURE_PATH",""); vi.stubEnv("POINTMOON_NOAA_ENABLED","0");
 const complete={schemaVersion:"field-truth@1.1.0",facts:{fieldSnapshot:{observations:{nearby:[{name:"Oak",iconicTaxon:"Plantae"}],absent:[],birds:{notable:[]}}}}};
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>complete}); vi.stubGlobal("fetch",fetch);
 const {fetchFieldTruth}=await import("@/lib/outside/pointmoon"); const request={lat:query.lat,lng:query.lng,tideStation:"8443970" as const,tideDate:query.date};
 await fetchFieldTruth(request); expect(fetch.mock.calls[0]![0]).not.toContain("noaa");
 vi.stubEnv("POINTMOON_NOAA_ENABLED","1"); await fetchFieldTruth(request);
 expect(fetch.mock.calls[1]![0]).toContain("evidenceSources=noaa"); expect(fetch.mock.calls[1]![0]).toContain("tideStation=8443970&tideDate=2026-09-08");
 vi.setSystemTime(now+61000); const report=fixture(); report.predictions.retrievedAt=new Date(now+61000).toISOString();
 fetch.mockResolvedValue({ok:true,json:async()=>({schemaVersion:"field-truth@1.1.0",facts:{fieldSnapshot:{coastalTides:report,observations:{nearby:[],absent:[],birds:{notable:[]}}}}})});
 for(let i=0;i<2;i++){const result=await fetchFieldTruth(request);expect(result?.facts?.fieldSnapshot?.coastalTides?.predictions?.events).toHaveLength(2);expect(result?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("Oak");}
 expect(fetch).toHaveBeenCalledTimes(3);
});
it("keeps measurement quality and clock separate and drops stale readings only", () => {
 const value=fixture(); value.localDate="2026-09-07"; value.predictions.validDate=value.localDate;
 value.predictions.window={startAt:"2026-09-07T04:00:00Z",endAt:"2026-09-08T04:00:00Z"}; value.predictions.events=[{at:"2026-09-07T13:00:00Z",heightMeters:2,type:"high"}];
 const measured={silent:false,evidenceKind:"measurement",observedAt:"2026-09-07T15:54:00Z",heightMeters:1.443,quality:"preliminary",validUntil:"2026-09-07T16:12:00Z",retrievedAt:new Date(now).toISOString(),sourceUrl:"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8443970&datum=MLLW&units=metric&time_zone=gmt&product=water_level",ttlMinutes:1};
 const reference=parseCoastalTides({...value,measured},{...query,date:value.localDate}); expect(reference?.measured?.quality).toBe("preliminary");
 expect(renderToStaticMarkup(<CoastalTides reference={reference}/>)).toContain("Separate station measurement: 1.44 m");
 const later=parseCoastalTides({...value,measured},{...query,date:value.localDate,now:now+60000}); expect(later?.measured).toBeNull(); expect(later?.predictions).not.toBeNull();
 expect(parseCoastalTides({...fixture(),measured},query)?.measured).toBeNull();
});

it('renders real Battery and Pacific producer references and rejects cross-station products', async () => {
 const fixture = (await import('../fixtures/noaa-station-expansion.json')).default;
 for (const record of fixture.records) {
  const expected = {lat:record.center.latitude,lng:record.center.longitude,stationId:record.station.id,date:record.localDate,now:Date.parse(fixture.checkedAt)};
  const reference = parseCoastalTides(record,expected); expect(reference).not.toBeNull();
  const markup=renderToStaticMarkup(<CoastalTides reference={reference}/>);
  expect(markup).toContain(record.station.name); expect(markup).toContain(record.station.timezone); expect(markup).toContain('not water levels at your school');
  const wrong=structuredClone(record); wrong.predictions.sourceUrl=wrong.predictions.sourceUrl.replace(record.station.id,'8443970');
  // The independent live measurement may survive; the mismatched prediction never does.
  expect(parseCoastalTides(wrong,expected)?.predictions ?? null).toBeNull();
  wrong.station.latitude=0; expect(parseCoastalTides(wrong,expected)).toBeNull();
 }
});
