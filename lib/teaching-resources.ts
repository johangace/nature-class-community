import { getSession, loadPack } from "./pack";
import { SOURCE_REPOSITORY_URL } from "./source";

export type TeachingResource = {
  slug: string; title: string; description: string; kind: "Guide" | "Lesson";
  sections: { heading: string; paragraphs: string[] }[];
  source?: { label: string; url: string };
  durationMin?: number;
};

// Read the same authored lesson as the classroom, never a second SEO copy.
const countingLife = getSession(loadPack("summer"), "summer-w1-counting-life");

export const TEACHING_RESOURCES: TeachingResource[] = [
  {
    slug: "counting-life-outdoor-science-lesson",
    title: "Counting life: a 20-minute outdoor science lesson",
    description: "A free outdoor science lesson: count living things within ten steps, look and listen, then discuss what makes something alive. Includes the teacher script.",
    kind: "Lesson", durationMin: countingLife.durationMin,
    source: { label: "Nature Class’s authored Counting life lesson (CC BY-SA 4.0)", url: `${SOURCE_REPOSITORY_URL}/blob/main/packs/summer.json` },
    sections: [
      { heading: "What the class will do", paragraphs: [countingLife.topic, countingLife.objective ?? "", "This is the base lesson, also introduced as Life detectives on our homepage. The classroom version helps you prepare it for your place and class."] },
      { heading: "Space and preparation", paragraphs: [countingLife.spaceNeeded ?? "", countingLife.preparation ?? "", "Check the space and conditions before taking the class out, following your school’s procedures. Agree a boundary everyone can use. Children can point, describe or listen from an accessible spot; the task does not require collecting or handling wildlife."] },
      ...countingLife.phases.map((phase) => ({
        heading: `${phase.title}${phase.durationMin ? ` · ${phase.durationMin} minutes` : ""}`,
        paragraphs: [
          ...phase.blocks.flatMap((block) => {
            if (block.type === "say-aloud" || block.type === "circle-question") return [`Say to the class: “${block.text}”`];
            if (block.type === "teacher-note") return [block.text];
            if (block.type === "conditions-line") return [block.fallbackText];
            return [];
          }),
          ...(phase.tips ?? []).map((tip) => `${tip.when} ${tip.then}`),
        ],
      })),
      { heading: "Curriculum connections", paragraphs: ["The authored lesson links to England Year 2: living things and their habitats. It supports observing and discussing living, dead and never-alive things.", "For US teachers, the pack references NGSS 2-LS4-1. To address its comparison of habitats, repeat the observation in a second habitat and compare what children find. One count in one spot is a starting point, not completion of the standard."] },
      { heading: "After the lesson", paragraphs: ["Ask children to draw a living thing they noticed and something they were unsure about. Record their own question to revisit on the next outing. A quiet patch or a disputed fallen leaf can be the beginning of the next lesson."] },
    ],
  },
  {
    slug: "plan-first-outdoor-lesson",
    title: "How to plan your first outdoor lesson",
    description: "A practical starting plan for primary and elementary teachers: choose a small space, one observation task, a clear boundary and a question to bring back inside.",
    kind: "Guide",
    sections: [
      { heading: "Start with one place and one question", paragraphs: ["Your first outdoor lesson can happen in a familiar corner of the school grounds. Choose somewhere the whole group can reach, gather and observe. You do not need a woodland or a list of species names.", "For a concrete first question, use the Counting life lesson: What is living within ten steps? Its base sequence takes about 20 minutes, with a closing circle. Allow additional time for getting outside, returning and whatever your class needs to settle."] },
      { heading: "Before the class arrives", paragraphs: ["Walk the space. Decide where the group will gather, what marks the boundary and where you will go if the space is unsuitable. Check conditions and use your school’s existing arrangements for supervision, clothing, access and risk assessment.", "Choose the learning task before choosing equipment. Counting life asks children to observe, point and listen; it has no required kit. If you want a record, plan one drawing or a shared tally afterwards, rather than asking everyone to carry a worksheet throughout."] },
      { heading: "Give the boundary before the task", paragraphs: ["Show children where they may go and how you will call them back. Choose a boundary they can recognise from their own position. A distance that works for one child may not work for another; agree an accessible shared area.", "Then give one instruction: count living things you can point to. Pairs can take turns noticing and explaining. You can lead this without identifying every plant: ask children to describe what they actually see, and keep uncertain identifications as questions."] },
      { heading: "Keep the learning in the observation", paragraphs: ["If children say there is nothing to see, look at a grass edge, a crack or a wall together. If the activity becomes a race, ask what tells them each thing is alive. If the count becomes an argument, point and count as a group.", "These are responses from the authored Counting life lesson. They give the teacher a next move while leaving room for the children’s discoveries. A shorter observation with a good question can be more useful than rushing through every step."] },
      { heading: "Bring a question back inside", paragraphs: ["Close by asking what surprised the class and what was difficult to decide. Invite pointing, drawing or speaking so that sharing is not limited to the quickest verbal answer.", "Write down one question and return to the same place another day. Compare the observations before offering an explanation. Nature Class’s lesson preparation and printable materials can help you carry that sequence into your next outing."] },
      { heading: "Using Nature Class", paragraphs: ["The teacher runtime is free and open source. Start with today’s lesson to choose a place, or browse the curriculum. The app is designed for the adult leading the lesson; children do not need accounts or profiles.", "The public example is a base script. Check your own grounds and the day’s conditions before leading it, and adapt the pace to your class."] },
    ],
  },
];

export function findTeachingResource(slug: string) {
  return TEACHING_RESOURCES.find((resource) => resource.slug === slug);
}
