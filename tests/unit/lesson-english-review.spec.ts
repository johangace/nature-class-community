import { expect, it } from "vitest";
import { localizeText } from "@/lib/localization";
import reviewed from "@/lib/localization-us-copy.json";
it("keeps UK source sentences intact and applies reviewed US grammar", () => {
  for (const source of Object.keys(reviewed)) {
    expect(localizeText(source, "uk")).toBe(source);
    expect(localizeText(source, "us")).not.toMatch(/schoolyard (?:are|have|is at their)/);
  }
});
it("does not change a plural subject merely because it precedes school grounds", () => {
  expect(localizeText("The birds who share your school grounds have more to eat.", "us"))
    .toBe("The birds who share your schoolyard have more to eat.");
  expect(localizeText("The corners of the grounds are sheltered.", "us"))
    .toBe("The corners of the schoolyard are sheltered.");
});
it("adapts the reviewed clothing and spelling without substituting species", () => {
  expect(localizeText("We travelled in a woolly jumper to practise.", "us"))
    .toBe("We traveled in a wool sweater to practice.");
  expect(localizeText("Conkers, woodlice and sycamore seeds", "us"))
    .toBe("Conkers, woodlice and sycamore seeds");
});
