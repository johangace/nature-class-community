/**
 * What a teacher can still do to make her lessons more her own, after the
 * two-question first run has let her in (#878).
 *
 * First run asks for a class and a place and nothing else. Everything the old
 * onboarding walk used to demand up front — grounds, features, reach — is now
 * optional work with a permanent home (Classes, Grounds). This module is the
 * one honest reading of how far that work has got, so a surface can say
 * "done" only about a thing that is actually stored, and can say what gets
 * better for doing the rest.
 *
 * Every `improves` line names a real seam in this codebase, not a hope:
 *
 * - location: Today reads weather, season and sightings for the class's
 *   coordinates, and with none it reads the sample patch
 *   (lib/outside/index.ts, "A school with NO coordinates ... keeps the demo
 *   default").
 * - class: the year group sets the ability band the lesson is written at
 *   (lib/ability.ts, bandForYearGroup).
 * - grounds: the ticked grounds and the features she names both become the
 *   habitat filter on what the class is asked to look for and what Today
 *   shows (lib/place-context.ts, reachableHabitatsFor: groundsToHabitats and
 *   habitatsFromFeatures).
 * - reach: the lesson's instruction is rewritten around "Places this class
 *   can actually reach" (lib/ai/place-instruction.ts).
 *
 * Deliberately NOT a task: the photograph. A photo is a way of answering the
 * features question (app/WorldBuilder.tsx, "never stored"), not a state the
 * class holds, so a "photo added" tick would be claiming something the
 * database cannot confirm. The ticket's draft list had it; the code says no.
 *
 * No badges, no scores, no "expert". A quiet list that says what is set and
 * what is still open, in sentence case, and nothing else.
 */

export type SetupTaskId = "location" | "class" | "grounds" | "reach";
export type SetupTaskState = "done" | "open";

export interface SetupTask {
  id: SetupTaskId;
  state: SetupTaskState;
  /** The job, as a short noun phrase a teacher would say. */
  title: string;
  /** One line describing the current state, true in both states. */
  status: string;
  /** What is better in the lesson because this is (or would be) done. */
  improves: string;
  /** Where to do it. Always a permanent surface, never /start. */
  href: string;
}

export interface SetupInput {
  classId: string;
  name: string;
  yearGroup: string;
  /** The place the class reads from: its Grounds profile when it has one. */
  lat: number | null;
  lng: number | null;
  /** The ticked grounds (trees, pond ...) and the features she named. */
  habitats: readonly string[];
  siteFeatures: readonly string[];
  reach: string | null;
}

export interface SetupProgress {
  tasks: SetupTask[];
  done: number;
  open: number;
  /** Every task done. The list can then go quiet. */
  complete: boolean;
}

function located(input: SetupInput): boolean {
  return (
    typeof input.lat === "number" &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng)
  );
}

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function setupProgress(input: SetupInput): SetupProgress {
  const classHref = "/classes";
  const groundsHref = `/world?classId=${encodeURIComponent(input.classId)}`;

  const hasLocation = located(input);
  const hasClass = trimmed(input.name).length > 0 && trimmed(input.yearGroup).length > 0;
  const groundCount = input.habitats.length + input.siteFeatures.length;
  const hasGrounds = groundCount > 0;
  const reach = trimmed(input.reach);
  const hasReach = reach.length > 0;

  const tasks: SetupTask[] = [
    {
      id: "location",
      state: hasLocation ? "done" : "open",
      title: "Location",
      status: hasLocation
        ? "Set. Today reads the weather and what has been seen near this point."
        : "Not set. Today reads a sample patch until it is.",
      improves:
        "The weather, the season and the recorded sightings on Today are read for this exact place.",
      href: classHref,
    },
    {
      id: "class",
      state: hasClass ? "done" : "open",
      title: "Class",
      status: hasClass
        ? `${trimmed(input.name)}, ${trimmed(input.yearGroup)}.`
        : "Name the class and choose its year.",
      improves: "The year sets the level the lesson is written at.",
      href: classHref,
    },
    {
      id: "grounds",
      state: hasGrounds ? "done" : "open",
      title: "Describe the place",
      status: hasGrounds
        ? `${groundCount} ${groundCount === 1 ? "thing" : "things"} noted about this place. Add more as it changes.`
        : "Say what is really out there: trees, a pond, a hedge, a log pile.",
      improves:
        "What the class is asked to look for, and what Today shows, is kept to places the class can reach.",
      href: groundsHref,
    },
    {
      id: "reach",
      state: hasReach ? "done" : "open",
      title: "How far the class can go",
      status: hasReach ? `${reach}.` : "Say how far the class can actually get on a lesson.",
      improves: "The lesson's instruction is rewritten around places the class can really reach.",
      href: groundsHref,
    },
  ];

  const done = tasks.filter((task) => task.state === "done").length;
  return { tasks, done, open: tasks.length - done, complete: done === tasks.length };
}
