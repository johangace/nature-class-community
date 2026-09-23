import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Wordmark } from "./Wordmark";

export const alt = "Nature Class — Teach with nature.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  // ImageResponse has no site CSS: use the canonical light-theme tokens.
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const token = (name: string) => {
    const value = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]+)`))?.[1];
    if (!value) throw new Error(`Missing social image colour token: ${name}`);
    return value;
  };
  const font = readFileSync(join(process.cwd(), "public/brand/fonts/Fredoka-Medium.ttf"));
  return new ImageResponse(
    <div style={{ background: token("paper"), width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 60, fontFamily: "Fredoka" }}>
      <Wordmark seed
        style={{ position: "relative", display: "flex", columnGap: 26, color: token("brand"), fontSize: 126, fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1 }}
        seedStyle={{ position: "absolute", top: -103, right: -113, width: 176, height: 161, color: token("action") }}
      />
      <div style={{ color: token("ink"), fontSize: 44, marginTop: 40 }}>Teach with nature.</div>
    </div>,
    { ...size, fonts: [{ name: "Fredoka", data: font, weight: 500, style: "normal" }] },
  );
}
