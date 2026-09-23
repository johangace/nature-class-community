import { Wordmark } from "./Wordmark";

function DandelionSeed() {
  return (
    <span className="dandelion-seed">
      <svg focusable="false" viewBox="-11 -25 22 40">
        <g strokeWidth="2.2">
          <ellipse cx="0" cy="12" fill="currentColor" rx="2.6" ry="5.4" />
          <path
            d="M0,6 L0,-9 M0,-9 L-9,-19 M0,-9 L-4.5,-22 M0,-9 L0.5,-23.5 M0,-9 L5.5,-21.5 M0,-9 L9.5,-18"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </span>
  );
}

/**
 * The one branded threshold shared by product and lesson entry.
 *
 * The mark is the only claim this state makes. Three decorative seeds move on
 * transform and opacity alone; reduced-motion users see one still seed.
 */
export function DandelionTransition({ message }: { message: string }) {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="dandelion-loading"
      role="status"
    >
      <div className="dandelion-lockup" data-logo="nature-class">
        <Wordmark className="dandelion-wordmark" />
        <span aria-hidden="true" className="dandelion-seeds">
          <DandelionSeed />
          <DandelionSeed />
          <DandelionSeed />
        </span>
      </div>
      <span className="sr-only">{message}</span>
    </main>
  );
}
