import { localizeText, type Locale } from "@/lib/localization";

/** Reviewed landing register. Proper names, attributed quotes and curriculum
 * citations are deliberately not passed through this function. Nature examples
 * keep their real place: choosing English (US) does not move London.
 */
const US_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ["For headteachers and school leaders", "For principals and school leaders"],
  ["A head asks", "A principal asks"],
  ["One number for the head.", "One number for the principal."],
  ["governors and parents", "school leaders and families"],
  ["class teachers", "classroom teachers"],
  ["class teacher", "classroom teacher"],
  ["Class teacher", "Classroom teacher"],
  ["timetable", "schedule"],
  ["No trip, no coach, no new place.", "No field trip, no bus, no new location."],
  ["The script on A4, the child’s sheet, cards to clip to yourself and cards to hold up.",
   "A printable script, the child’s sheet, cards to clip to yourself and cards to hold up."],
  ["Outdoor training programmes", "Outdoor education programs"],
  ["Scouts and guides", "Scouting groups"],
  ["Holiday camps", "School-break camps"],
  ["Environmental charities", "Environmental nonprofits"],
  ["programme", "program"],
  ["Programme", "Program"],
  ["kinaesthetic", "kinesthetic"],
  ["tyre", "tire"],
  ["gather round", "gather around"],
  ["the habitats your grounds have", "the habitats around your school"],
];

export function landingText(text: string, locale: Locale): string {
  if (locale === "uk") return text;
  for (const [from, to] of US_PHRASES) text = text.split(from).join(to);
  return localizeText(text, locale);
}
