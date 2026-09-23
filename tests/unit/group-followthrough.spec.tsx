import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
import { AppNavClient } from "@/app/AppNavClient";
import { GroupFields } from "@/app/classes/GroupFields";
import { groupNoun } from "@/lib/group-profile";

describe("audience-specific group management", () => {
  it.each([null, "school"])("preserves school vocabulary for %s", (groupType) => {
    const markup = renderToStaticMarkup(<AppNavClient place={{ id: "school", name: "Oak", groundsName: "School", groupType }} />);
    expect(markup).toContain(">Classes</span>");
    expect(groupNoun(groupType)).toBe("class");
    const fields = renderToStaticMarkup(<GroupFields defaultType={groupType} />);
    expect(fields).toContain("Class name (optional)");
  });
  it.each(["family", "other"])("uses group navigation for %s without relabeling schools", (groupType) => {
    const markup = renderToStaticMarkup(<AppNavClient place={{ name: "Saturday", id: "one", groundsName: "Park", groupType }} />);
    expect(markup).toContain(">Groups</span>");
    expect(markup).not.toContain(">Classes</span>");
  });
  it("offers school first and a family name with age, without requiring a grade", () => {
    const fields = renderToStaticMarkup(<GroupFields defaultType="family" />);
    expect(fields.indexOf(">School</option>")).toBeLessThan(fields.indexOf(">My family</option>"));
    expect(fields).toContain("Family name (optional)");
    expect(fields).toContain('value="family" selected=""');
    expect(fields).toContain(">13+</option>");
    expect(fields).not.toContain('name="yearGroup"');
    expect(fields).not.toContain('required=""');
  });
});
