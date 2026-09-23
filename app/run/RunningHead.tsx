"use client";

import { useEffect, useRef, type ReactElement } from "react";

/**
 * The running head, made honest (nc#287).
 *
 * The server used to stamp `aria-current` on the first part and never move it,
 * so the head permanently claimed the lesson was on part one — the orientation
 * it exists to give was a lie from the second screen on. This client shell
 * watches the sections and moves the mark to whichever one owns the viewport.
 *
 * Progressive enhancement, not a dependency: the server renders the same
 * anchors with no current mark, so with no JS the head still navigates and
 * simply claims nothing it cannot know.
 */
export function RunningHead({
  parts,
}: {
  parts: Array<{ id: string; title: string }>;
}): ReactElement {
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const links = new Map<string, HTMLAnchorElement>();
    for (const link of nav.querySelectorAll<HTMLAnchorElement>("a[data-part]")) {
      links.set(link.dataset.part ?? "", link);
    }

    const visible = new Map<string, number>();
    const mark = () => {
      let bestId: string | null = null;
      let bestRatio = 0;
      for (const [id, ratio] of visible) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = id;
        }
      }
      for (const [id, link] of links) {
        if (id === bestId) {
          link.setAttribute("aria-current", "true");
          link.scrollIntoView({ block: "nearest", inline: "nearest" });
        } else {
          link.removeAttribute("aria-current");
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        mark();
      },
      { threshold: [0, 0.25, 0.5, 0.75] }
    );

    for (const id of links.keys()) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [parts]);

  return (
    <nav className="run-head" aria-label="Parts of this lesson" ref={navRef}>
      {parts.map((part) => (
        <a key={part.id} href={`#${part.id}`} data-part={part.id}>
          {part.title}
        </a>
      ))}
    </nav>
  );
}
