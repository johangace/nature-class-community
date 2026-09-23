import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { validPlaceEvidence, lessonPlaceSources, lessonReferences, type PlaceQuery } from "@/lib/outside/place-evidence";
import { TeacherReferences } from "@/app/outside/TeacherReferences";
import landscape from "../support/landscape-references.json";
import place from "../support/place-references.json";
import globi from "../support/globi-references.json";
const now = new Date("2026-09-07T18:00:00Z");
const query: PlaceQuery = {lat:51.51,lng:-0.165,sources:["soilgrids","copernicus"]};
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});
it("selects only applicable sources behind default-off flag",()=>{
 expect(lessonPlaceSources(["trees","soil"])).toEqual([]);vi.stubEnv("POINTMOON_PLACE_EVIDENCE_ENABLED","1");
 expect(lessonPlaceSources(["soil"])).toEqual(["soilgrids"]);expect(lessonPlaceSources(["water"])).toEqual([]);
 expect(lessonPlaceSources(["trees"])).toEqual(["gbif","globi","phenocam","inventory","copernicus","bsbi"]);
});
it("renders actual reference model ranges, dated satellite comparison and receipts without school claims",()=>{
 vi.setSystemTime(now);const cards=lessonReferences(landscape,query,[]);expect(cards).toHaveLength(2);
 const html=renderToStaticMarkup(<TeacherReferences references={cards}/>);
 expect(html).toContain("modelled pH 6.1");expect(html).toContain("3.8–7.9");expect(html).toContain("Reference plot only");expect(html).toContain("Model retrieved");expect(html).toContain("phh2o_0-5cm_mean");expect(html).toContain("Scene 1");
});
it("rejects wrong center, expired model, incomplete receipts and insufficient satellite pixels independently",()=>{
 expect(validPlaceEvidence(landscape,{...query,lat:0},now)).toEqual({});
 const broken=structuredClone(landscape);broken.soilContext.properties[0]!.receipts=[];broken.soilContext.properties[1]!.receipts=[];
 expect(validPlaceEvidence(broken,query,now)).not.toHaveProperty("soilContext");expect(validPlaceEvidence(broken,query,now)).toHaveProperty("vegetationComparison");
 broken.vegetationComparison.quality.commonValidPixels=0;expect(validPlaceEvidence(broken,query,now)).toEqual({});
 expect(validPlaceEvidence(landscape,query,new Date("2028-01-01"))).toEqual({});
});
it("matches published relationships to actual lesson scientific names",()=>{
 vi.setSystemTime(now);const q:PlaceQuery={...query,sources:["globi"]};
 expect(lessonReferences({relationships:globi},q,["Quercus rubra"])).toEqual([]);
 const cards=lessonReferences({relationships:globi},q,["Crataegus monogyna"]);expect(cards.length).toBeGreaterThan(0);
 const html=renderToStaticMarkup(<TeacherReferences references={cards}/>);expect(html).toContain("Published study context");expect(html).toContain("not an observation date");expect(html).toContain("Original study");
});
it("does not present inventory candidates until they match the lesson and requires teacher verification",()=>{
 vi.setSystemTime(new Date(place.treeInventory.retrievedAt));const q:PlaceQuery={lat:place.treeInventory.center.latitude,lng:place.treeInventory.center.longitude,sources:["inventory"]};
 expect(lessonReferences(place,q,[])).toEqual([]);const name=place.treeInventory.records[0]!.scientificName;
 const cards=lessonReferences(place,q,[name]);expect(cards.length).toBeGreaterThan(0);const html=renderToStaticMarkup(<TeacherReferences references={cards}/>);expect(html).toContain("teacher must locate and identify");expect(html).toContain("survey date unknown");
});
it("expires camera at six hours, independently of a fresh inventory",()=>{
 const at=new Date(place.cameraEvidence.retrievedAt);const q:PlaceQuery={lat:place.cameraEvidence.center.latitude,lng:place.cameraEvidence.center.longitude,sources:["phenocam"]};
 expect(validPlaceEvidence(place,q,at)).toHaveProperty("cameraEvidence");expect(validPlaceEvidence(place,q,new Date(at.getTime()+6*3600000))).toEqual({});
});
it("opts in through one facts client, separates source cache keys and keeps fresh source through observation fallback",async()=>{
 vi.setSystemTime(now);vi.stubEnv("POINTMOON_PLACE_EVIDENCE_ENABLED","0");vi.stubEnv("POINTMOON_FIXTURE_PATH","");
 const complete={schemaVersion:"field-truth@1.1.0",facts:{fieldSnapshot:{observations:{nearby:[{name:"Oak",iconicTaxon:"Plantae"}],absent:[],birds:{notable:[]}}}}};
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>complete});vi.stubGlobal("fetch",fetch);const {fetchFieldTruth}=await import("@/lib/outside/pointmoon");const request={lat:query.lat,lng:query.lng,placeSources:query.sources};
 await fetchFieldTruth(request);expect(fetch.mock.calls[0]![0]).not.toContain("evidenceSources");
 vi.stubEnv("POINTMOON_PLACE_EVIDENCE_ENABLED","1");await fetchFieldTruth(request);expect(fetch.mock.calls[1]![0]).toContain("evidenceSources=copernicus,soilgrids");
 vi.setSystemTime(now.getTime()+16*60000);fetch.mockResolvedValue({ok:true,json:async()=>({schemaVersion:"field-truth@1.1.0",facts:{fieldSnapshot:{...landscape,observations:{nearby:[],absent:[],birds:{notable:[]}}}}})});
 for(let i=0;i<2;i++){const result=await fetchFieldTruth(request);expect(result?.facts?.fieldSnapshot?.placeEvidence).toHaveProperty("soilContext");expect(result?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("Oak");}
 expect(fetch).toHaveBeenCalledTimes(3);
});
it("keeps GBIF as historical context and rejects a record outside its declared month",()=>{
 vi.setSystemTime(now);const gbif={provider:"gbif",evidenceKind:"historical-occurrence-sample",resolutionStatus:"partial",findability:"not-assessed",readAt:now.toISOString(),validUntil:"2026-09-08T18:00:00Z",window:{latitude:query.lat,longitude:query.lng,radiusKm:5,month:9,yearStart:2020,yearEnd:2025},sampling:{nonInaturalistOnly:true},candidates:[{gbifSpeciesKey:1,scientificName:"Quercus robur",references:[{occurrenceKey:1,datasetKey:"fixture-dataset",sourceUrl:"https://www.gbif.org/occurrence/1",datasetUrl:"https://www.gbif.org/dataset/fixture-dataset",eventDate:"2025-09-04",license:"CC-BY-4.0"}]}]};
 const q:PlaceQuery={...query,sources:["gbif"]};expect(lessonReferences({gbifSeasonal:gbif},q,[])).toEqual([]);
 const cards=lessonReferences({gbifSeasonal:gbif},q,["Quercus robur"]);expect(cards).toHaveLength(1);expect(cards[0]?.scope).toContain("does not establish current presence");
 gbif.candidates[0]!.references[0]!.eventDate="2025-08-04";expect(lessonReferences({gbifSeasonal:gbif},q,["Quercus robur"])).toEqual([]);
});
