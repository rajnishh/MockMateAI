import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { getDb } from "@/lib/db";
import { giftState, publicGift } from "@/lib/gifts";
import { photoType } from "@/lib/photos";

// The picture in the WhatsApp preview: the cover on the saffron hero, "A song for you" and the AI
// label. Names and the occasion go in the preview's title text, which WhatsApp draws in the
// reader's own script; the note stays out to keep the surprise.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A song for you, made with AI on Reelkar";

async function coverData(file: string | null | undefined): Promise<string | null> {
  if (!file) return null;
  const data = await readFile(file).catch(() => null);
  // The image renderer reads JPEG and PNG; a WebP photo falls back to the plain card.
  const type = data ? photoType(data) : undefined;
  return data && (type === "jpg" || type === "png") ? `data:image/${type === "jpg" ? "jpeg" : "png"};base64,${data.toString("base64")}` : null;
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await publicGift(getDb(), token);
  const state = found ? giftState(found) : "removed";
  const cover = found && state !== "removed" && state !== "taken_down" ? await coverData(found.gift.coverPath ?? found.song.coverPath) : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 56, padding: 64, background: "linear-gradient(135deg, #ffb21a 0%, #ff7a1a 100%)", color: "#2a1235", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", width: 440, height: 440, borderRadius: 40, overflow: "hidden", background: "#2a1235", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered into the PNG, not the page */}
          {cover ? <img src={cover} width={440} height={440} style={{ objectFit: "cover" }} alt="" /> : <div style={{ display: "flex", flex: 1, background: "radial-gradient(circle at 30% 30%, #ffb21a, #ff4d2e 60%, #2a1235)" }} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 3 }}>REELKAR</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>A song for you</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, background: "#2a1235", color: "#ffffff", borderRadius: 999, padding: "14px 32px", alignSelf: "flex-start" }}>▶ Tap to open</div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, background: "rgba(42,18,53,0.12)", borderRadius: 999, padding: "8px 22px", alignSelf: "flex-start" }}>Made with AI</div>
        </div>
      </div>
    ),
    size,
  );
}
