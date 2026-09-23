# Nature Class logo

The product lockup lives in `app/Wordmark.tsx`. It keeps the words, seed path
and accessible markup in one implementation. The words consume `--brand`:
`#1a758f` on the light ground and `#9bdaef` on the outdoor dark ground. Every
live lockup seed consumes `--seed`, which follows the canonical action green
in each active theme. The optional navy surface is mapped separately as
`--ground-secondary: #142835`, paired with `--brand-on-secondary: #9bdaef`
and `--seed-on-secondary: #5fd47f`; it is in the system but is not applied to
an existing screen yet.

Use `<Wordmark seed />` once in a public or authenticated masthead. Use the
plain `<Wordmark />` in tight lesson furniture. Printed materials use
`<Wordmark seed className="print-logo" />`: a compact, static lockup with its
seed inside the reserved space. Each detachable card keeps its own logo;
paper uses the sheet ink so the mark survives monochrome copying. Do not paste a second
lockup into a page that already renders the authenticated shell.

`nature-class-seed.svg` is the supplied standalone current-colour seed for
favicons, bullets and non-React exports. The live lockup uses the matching
inline path so it can inherit `--seed`, invert with the outdoor tokens and
remain hidden from assistive technology.

Fredoka is loaded locally through `next/font` in `app/layout.tsx`. Use the
project tokens in `app/globals.css`; do not copy the supplier demo palette or
add a remote font stylesheet.

Motion is reserved for short transition states and must freeze under
`prefers-reduced-motion`. The everyday masthead mark stays still.

Social previews use the shared `Wordmark` with “Teach with nature.” and the same
light-theme tokens. `fonts/Fredoka-Medium.ttf` is a static instance (weight 500,
width 100) of Google Fonts' OFL Fredoka, bundled for ImageResponse; its license
is alongside it. The browser favicon uses the supplied seed silhouette in
`--action` green on `--paper`, tilted to match the wordmark.
