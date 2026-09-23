import { readFileSync } from "node:fs";
/** Original byte recording. Tests may construct explicitly described variants. */
export function londonReplay() {
  return JSON.parse(readFileSync(new URL("./london.json", import.meta.url), "utf8"));
}
/** Constructed isolation: the retained London calendar with observations removed. */
export function londonCalendarOnly() {
  const p = londonReplay();
  p.facts.fieldSnapshot.observations = { nearby: [], absent: [], birds: { notable: [] } };
  return p;
}
