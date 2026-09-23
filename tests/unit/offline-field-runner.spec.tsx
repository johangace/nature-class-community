import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HybridJourney } from "@/app/run/HybridJourney";
import { findSession } from "@/lib/pack";

const session = findSession("summer-w1-counting-life")?.session;
if (!session) throw new Error("offline runner fixture is missing");

describe("the core-only field runner", () => {
  it("keeps every offline doorway and exit inside the field shell", () => {
    const markup = renderToStaticMarkup(
      <HybridJourney
        hazards={{
          source: "starter",
          entries: [{ id: "boundary", name: "Staying together", note: "Set the edge first." }],
        }}
        previewSeconds={60}
        session={session}
        navigationHrefs={{
          exit: `/field?session=${session.id}`,
          preview: `/field?session=${session.id}&view=lesson`,
          primer: `/field?session=${session.id}&view=primer`,
          safety: `/field?session=${session.id}&view=safety`,
          print: `/field/print?session=${session.id}`,
        }}
      />
    );

    expect(markup).toContain(`href="/field?session=${session.id}"`);
    // The preparation links (primer, safety, lesson, print) left the runner
    // with the doorstep (2026-09-06); the field shell's own lesson view holds
    // them. What the runner keeps is the exit, which has to stay inside the
    // shell.
    expect(markup).not.toContain('href="/session/');
    expect(markup).not.toContain('href="/print?');
    expect(markup).not.toContain('href="/"');
  });

  it("keeps a direct online run in the live mode when no adapter is supplied", () => {
    const markup = renderToStaticMarkup(<HybridJourney session={session} />);

    expect(markup).toContain('href="/"');
    expect(markup).toContain("Introduce today");
    expect(markup).not.toContain(`/session/primer?session=${session.id}`);
    expect(markup).not.toContain(`/print?session=${session.id}`);
  });

  it("returns an authenticated run to the separate Today workspace", () => {
    const markup = renderToStaticMarkup(
      <HybridJourney homeHref="/today" session={session} />
    );

    expect(markup).toContain('href="/today"');
    expect(markup).not.toContain('href="/"');
  });
});
