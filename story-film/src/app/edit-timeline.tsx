"use client";

import { type PointerEvent as ReactPointerEvent, type RefObject, useRef } from "react";
import { type CaptionLine, type DragMode, dragSpan, formatTime, type MomentKind, type Span } from "@/lib/edit/moments";
import type { EditPlan } from "@/lib/edit/plan";

export interface TimelineMoment {
  key: string;
  kind: MomentKind;
  label: string;
  start: number;
  end: number;
  off: boolean;
  problem?: string;
}

const PX_PER_SEC = 64;
const LANE_H = 34;
const EDGE = 10;
const LANES: { kind: MomentKind | "captions"; label: string; color: string }[] = [
  { kind: "effect", label: "Effects", color: "#2bc4b4" },
  { kind: "card", label: "Cards", color: "#f27a5e" },
  { kind: "zoom", label: "Zooms", color: "#18264a" },
  { kind: "captions", label: "Captions", color: "transparent" },
];

// Lanes of draggable blocks: drag to move, drag an edge to stretch, click the ruler to seek.
export function EditTimeline({
  duration,
  moments,
  lines,
  snaps,
  time,
  selected,
  onSelect,
  onSeek,
  onChange,
}: {
  duration: number;
  moments: TimelineMoment[];
  lines: CaptionLine[];
  snaps: number[];
  time: number;
  selected: string | null;
  onSelect: (key: string) => void;
  onSeek: (t: number) => void;
  onChange: (key: string, span: Span, mode: DragMode) => void;
}) {
  const drag = useRef<{ key: string; kind: MomentKind; mode: DragMode; origin: Span; x: number } | null>(null);
  const width = Math.max(1, duration) * PX_PER_SEC;

  const down = (e: ReactPointerEvent<HTMLDivElement>, m: TimelineMoment) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const edges = rect.width >= EDGE * 3.5;
    const mode: DragMode = edges && x < EDGE ? "start" : edges && x > rect.width - EDGE ? "end" : "move";
    drag.current = { key: m.key, kind: m.kind, mode, origin: { start: m.start, end: m.end }, x: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(m.key);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>, m: TimelineMoment) => {
    const d = drag.current;
    if (!d || d.key !== m.key || m.off) return;
    const span = dragSpan(d.origin, d.mode, (e.clientX - d.x) / PX_PER_SEC, d.kind, duration, snaps);
    onChange(d.key, span, d.mode);
  };
  const seek = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(duration, (e.clientX - rect.left) / PX_PER_SEC)));
  };

  return (
    <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
      <div style={{ paddingTop: 20, width: 64, flexShrink: 0 }}>
        {LANES.map((l) => (
          <div key={l.kind} className="muted" style={{ height: LANE_H, display: "flex", alignItems: "center", fontSize: 12 }}>
            {l.label}
          </div>
        ))}
      </div>
      <div style={{ overflowX: "auto", flex: 1 }}>
        <div style={{ position: "relative", width, height: 20 + LANE_H * LANES.length, userSelect: "none" }} onPointerDown={seek}>
          {Array.from({ length: Math.floor(duration) + 1 }, (_, s) => (
            <div key={s} className="muted" style={{ position: "absolute", left: s * PX_PER_SEC, top: 0, height: 20, borderLeft: "1px solid var(--border)", paddingLeft: 2, fontSize: 10, pointerEvents: "none" }}>
              {s % 2 === 0 ? `${s}s` : ""}
            </div>
          ))}
          {LANES.map((l, i) => (
            <div key={l.kind} style={{ position: "absolute", left: 0, top: 20 + i * LANE_H, width, height: LANE_H, background: i % 2 ? "transparent" : "color-mix(in srgb, var(--border) 50%, transparent)" }} />
          ))}
          {lines.map((l) => (
            <div
              key={l.from}
              style={{ position: "absolute", top: 20 + 3 * LANE_H + 5, left: l.start * PX_PER_SEC, width: Math.max(6, (l.end - l.start) * PX_PER_SEC - 2), height: LANE_H - 10, border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, overflow: "hidden", whiteSpace: "nowrap", padding: "4px 6px", pointerEvents: "none" }}>
              {l.text}
            </div>
          ))}
          {moments.map((m) => {
            const lane = LANES.findIndex((l) => l.kind === m.kind);
            const color = LANES[lane].color;
            return (
              <div
                key={m.key}
                role="button"
                aria-label={`${m.label}, ${formatTime(m.start)} to ${formatTime(m.end)}${m.off ? ", off" : ""}${m.problem ? `. ${m.problem}` : ""}`}
                title={m.problem ?? `${m.label} · drag to move, drag an edge to stretch`}
                onPointerDown={(e) => down(e, m)}
                onPointerMove={(e) => move(e, m)}
                onPointerUp={() => (drag.current = null)}
                style={{
                  position: "absolute",
                  top: 20 + lane * LANE_H + 4,
                  left: m.start * PX_PER_SEC,
                  width: Math.max(10, (m.end - m.start) * PX_PER_SEC),
                  height: LANE_H - 8,
                  borderRadius: 6,
                  background: m.off ? "transparent" : color,
                  color: m.kind === "zoom" ? "#fff" : "#111",
                  border: `${m.problem || selected === m.key ? 3 : 1}px ${m.off ? "dashed" : "solid"} ${m.problem ? "var(--danger)" : selected === m.key ? "var(--accent)" : color === "transparent" ? "var(--border)" : color}`,
                  opacity: m.off ? 0.6 : 1,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 8px",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  cursor: "grab",
                  touchAction: "none",
                  boxSizing: "border-box",
                }}>
                {m.label}
              </div>
            );
          })}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: time * PX_PER_SEC, width: 2, background: "#f27a5e", pointerEvents: "none" }} />
        </div>
      </div>
    </div>
  );
}

type Box = [number, number, number, number] | null;
const W = 240;
const H = (W * 16) / 9;

// The clip with a rough sketch of the edit drawn on top.
export function EditPreview({
  src,
  videoRef,
  time,
  plan,
  off,
  words,
  lines,
  faces,
  captions,
  onTime,
  onPlaying,
}: {
  src: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  time: number;
  plan: EditPlan;
  off: Set<string>;
  words: { word: string; start: number; end: number }[];
  lines: CaptionLine[];
  faces: { rate: number; boxes: Box[] } | null;
  captions: boolean;
  onTime: (t: number) => void;
  onPlaying: (playing: boolean) => void;
}) {
  const on = <T extends { start: number; end: number }>(list: T[], prefix: string) => list.filter((x, i) => !off.has(`${prefix}${i}`) && time >= x.start && time <= x.end);
  const effect = on(plan.effects, "e")[0];
  const card = on(plan.cards, "c")[0];
  const zoom = on(plan.zooms, "z").length > 0;
  const face = faces?.boxes[Math.min(faces.boxes.length - 1, Math.round(time * faces.rate))] ?? null;
  const fx = face ? (face[0] + face[2] / 2) * W : W / 2;
  const fy = face ? (face[1] + face[3] / 2) * H : H * 0.42;
  const line = captions ? lines.find((l) => time >= l.start && time <= l.end + 0.4) : undefined;
  const lineWords = line ? words.slice(line.from, line.to + 1) : [];
  const active = lineWords.findIndex((w) => time < w.end);
  const from = Math.max(0, Math.min(active < 0 ? lineWords.length - 3 : active - 1, lineWords.length - 3));

  return (
    <div style={{ position: "relative", width: W, height: H, margin: "0 auto", borderRadius: 12, overflow: "hidden", background: "#1d2a47" }}>
      {src ? (
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="auto"
          onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
          onPlay={() => onPlaying(true)}
          onPause={() => onPlaying(false)}
          onEnded={() => onPlaying(false)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: zoom ? `translate(${(W / 2 - fx) * 0.14}px, ${(H / 2 - fy) * 0.14}px) scale(1.14)` : undefined,
            transition: "transform 0.2s ease-out",
          }}
        />
      ) : (
        <div style={{ position: "absolute", left: fx - W * 0.22, top: fy - H * 0.08, width: W * 0.44, height: H * 0.6, borderRadius: "80px 80px 0 0", background: "#33456e" }} />
      )}
      {effect?.type === "spotlight" && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />}
      {effect?.type === "cutout" && <div style={{ position: "absolute", inset: 0, border: "10px solid #2bc4b4" }} />}
      {effect?.type === "backdrop" && (
        <div style={{ position: "absolute", left: 6, right: 6, top: Math.max(4, fy - H * 0.12), color: "rgba(255,255,255,0.9)", font: "800 44px/1 system-ui", textAlign: "center", overflowWrap: "anywhere" }}>
          {effect.text.toUpperCase()}
        </div>
      )}
      {effect?.type === "stamp" && (
        <div style={{ position: "absolute", top: fy - 16, left: fx < W / 2 ? Math.min(W - 100, fx + 26) : Math.max(4, fx - 120), border: "3px solid #e23b3b", borderRadius: 6, color: "#e23b3b", font: "800 20px system-ui", padding: "0 8px", transform: "rotate(-8deg)" }}>
          {effect.text.toUpperCase()}
        </div>
      )}
      {effect?.type === "focus" && (
        <div style={{ position: "absolute", left: fx - (face ? face[2] * W * 0.7 : 34), top: fy - (face ? face[3] * H * 0.7 : 34), width: face ? face[2] * W * 1.4 : 68, height: face ? face[3] * H * 1.4 : 68, border: "2px solid #fff", borderRadius: 6 }}>
          {effect.label && <span style={{ position: "absolute", bottom: -20, left: "50%", transform: "translateX(-50%)", background: "#fff", color: "#111", fontSize: 10, padding: "1px 6px", borderRadius: 8, whiteSpace: "nowrap" }}>{effect.label}</span>}
        </div>
      )}
      {card && (
        <div style={{ position: "absolute", left: W * 0.07, right: W * 0.07, top: H * 0.6 - 26, background: card.type === "stat" ? "#2bc4b4" : "rgba(255,255,255,0.92)", color: "#111", borderRadius: 10, padding: 8, font: "700 12px system-ui", textAlign: "center", whiteSpace: "pre-line" }}>
          {card.type === "list" ? `${card.heading}\n${card.items.filter(Boolean).map((x) => `✓ ${x}`).join("\n")}` : card.type === "stat" ? `${card.prefix ?? ""}${card.value}${card.suffix ?? ""} ${card.label}` : card.type === "cta" ? `${card.text}${card.action ? ` · ${card.action}` : ""}` : card.text}
        </div>
      )}
      {lineWords.length > 0 && (
        <div style={{ position: "absolute", left: 8, right: 8, top: H * 0.8 - 14, background: "rgba(10,10,14,0.72)", borderRadius: 10, padding: "4px 0", color: "#fff", font: "700 13px system-ui", textAlign: "center" }}>
          {lineWords.slice(from, from + 3).map((w, i) => (
            <span key={i} style={{ color: from + i === active ? "#ffd166" : "#fff" }}>
              {i ? " " : ""}
              {w.word}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
