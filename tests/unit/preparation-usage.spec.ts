import { describe, expect, it } from "vitest";
import { preparationUsageSchema } from "@/lib/prepared-day/usage";
import { matchingDecisionDimensions } from "@/lib/prepared-day/decisions";
import { contextRevisionSchema } from "@/schema/prepared-day";
const context = contextRevisionSchema.parse({revisionId:"one",placeKey:{resolution:"koppen",value:"Cfb",resolvedBy:"test"},ability:{band:null,resolvedBy:"base"},weather:{reach:"the-planned-hour",conditionKind:null,reasonCode:"not-asked",observedAt:null,validUntil:null,source:null},siteProfile:null,plannedAt:"2026-09-09T10:00:00Z",plannedTimeZone:"Europe/London",jurisdiction:null,locale:null,teacherNotes:[],capturedAt:"2026-09-08T10:00:00Z"});
describe("preparation evidence classification", () => {
 it("requires evaluation dataset and split and refuses evaluation metadata on production", () => {
  expect(preparationUsageSchema.safeParse({kind:"evaluation"}).success).toBe(false);
  expect(preparationUsageSchema.safeParse({kind:"production",split:"held-out"}).success).toBe(false);
  expect(preparationUsageSchema.parse({kind:"evaluation",datasetId:"rain",split:"held-out"}).kind).toBe("evaluation");
 });
 it("keeps place namespaces distinct while ignoring resolver-version changes", () => {
  const changed=structuredClone(context);changed.placeKey.resolution="polygon";
  expect(matchingDecisionDimensions(context, changed)).toEqual([]);
  changed.placeKey.resolution="koppen";changed.placeKey.resolvedBy="new-resolver";
  expect(matchingDecisionDimensions(context, changed)).toEqual(["placeKey.value"]);
 });
 it("does not count unknown context as relevance or treat a decision as a quality verdict", () => {
  expect(matchingDecisionDimensions(context, context)).toEqual(["placeKey.value"]);
  const changed=structuredClone(context);changed.jurisdiction="england";
  expect(matchingDecisionDimensions(context, changed)).toEqual(["placeKey.value"]);
 });
});
