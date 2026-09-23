import React from "react";
import type { CSSProperties, ReactElement } from "react";

/**
 * The product's name, set once.
 *
 * Before this existed the app spelled itself four ways on four screens —
 * "Nature Class" in the tab, "Nature · class" on the landing, "Nature class"
 * on Today and in the run, "nature class" on the child's sheet. A teacher
 * never articulates that; they just feel that nobody owns the thing. So the
 * name lives in exactly one component and every surface renders this.
 *
 * The lockup is two words, no separator, with the first word held back and
 * the second at full strength. It carries no size or face of its own. Its
 * colour comes from the semantic --brand mapping, so the same
 * mark reads as a small letterspaced caption in the run's top bar and as a
 * display wordmark on the landing without becoming two different marks or
 * inheriting the colour of unrelated surrounding chrome.
 *
 * Public and authenticated mastheads opt into the supplied static seed lockup.
 * Tight teaching furniture keeps the unadorned wordmark. Printed materials
 * reserve room for the compact seed lockup with print-logo styling.
 * Usage lives in public/brand/README.md.
 */
export function Wordmark({
  className,
  seed = false,
  style,
  seedStyle,
}: {
  className?: string;
  seed?: boolean;
  /** Inline presentation for image rendering, where site CSS is unavailable. */
  style?: CSSProperties;
  seedStyle?: CSSProperties;
}): ReactElement {
  return (
    <span
      className={className ? `wordmark ${className}` : "wordmark"}
      style={style}
      data-logo={seed ? "nature-class" : undefined}
    >
      <span className="wordmark-first">Nature</span>{" "}
      <span className="wordmark-second">Class</span>
      {seed ? (
        <svg
          style={seedStyle}
          aria-hidden="true"
          className="wordmark-seed"
          focusable="false"
          viewBox="-32 -26 52 46"
        >
          <g strokeWidth="2.2">
            <circle cx="-22" cy="13" fill="currentColor" opacity="0.35" r="1.5" />
            <circle cx="-14" cy="6" fill="currentColor" opacity="0.55" r="1.8" />
            <g transform="rotate(30)">
              <ellipse cx="0" cy="12" fill="currentColor" rx="2.6" ry="5.4" />
              <path
                d="M0,6 L0,-9 M0,-9 L-9,-19 M0,-9 L-4.5,-22 M0,-9 L0.5,-23.5 M0,-9 L5.5,-21.5 M0,-9 L9.5,-18"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
              />
            </g>
          </g>
        </svg>
      ) : null}
    </span>
  );
}
