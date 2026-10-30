"use client";

import { type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type CaptionLine,
  clampZoom,
  type DragMode,
  dragSpan,
  fitZoom,
  formatTime,
  type MomentKind,
  scrollForZoom,
  type Span,
  type Word,
  WORD_ZOOM,
} from "@/lib/edit/moments";
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

const LANE_H = 34;
const EDGE = 10;
const LANES: { kind: MomentKind | "captions"; label: string; color: string }[] = [
  { kind: "effect", label: "Effects", color: "#2bc4b4" },
  { kind: "card", label: "Cards", color: "#f27a5e" },
  { kind: "zoom", label: "Zooms", color: "#18264a" },
  { kind: "captions", label: "Captions", color: "transparent" },
];

// Lanes of draggable blocks: drag to move, drag an edge to stretch, click the ruler to seek.
// Zoom with −/+/Fit or Ctrl/⌘ + scroll (a trackpad pinch); zoomed in, captions show single words
// that can be retimed the same way.
export function EditTimeline({
  duration,
  moments,
  lines,
  words,
  snaps,
  time,
  selected,
  onSelect,
  onSeek,
  onChange,
  onWordDrag,
}: {
  duration: number;
  moments: TimelineMoment[];
  lines: CaptionLine[];
  words: Word[];
  snaps: number[];
  time: number;
  selected: string | null;
  onSelect: (key: string) => void;
  onSeek: (t: number) => void;
  onChange: (key: string, span: Span, mode: DragMode) => void;
  onWordDrag: (index: number, origin: Span, mode: DragMode, deltaSec: number) => void;
}) {
  const drag = useRef<{ key: string; kind: MomentKind | "word"; mode: DragMode; origin: Span; x: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(64);
  const pending = useRef<number | null>(null);
  const width = Math.max(1, duration) * pps;
  const showWords = pps >= WORD_ZOOM && words.length > 0;

  useLayoutEffect(() => {
    if (pending.current !== null && box.current) box.current.scrollLeft = pending.current;
    pending.current = null;
  }, [pps]);

  const zoomTo = useCallback(
    (next: number, focusX?: number) => {
      const el = box.current;
      const view = el?.clientWidth ?? 600;
      const to = clampZoom(next, view, duration);
      setPps((from) => {
        if (Math.abs(to - from) < 0.01) return from;
        pending.current = scrollForZoom(el?.scrollLeft ?? 0, focusX ?? view / 2, from, to);
        return to;
      });
    },
    [duration],
  );

  // Ctrl/⌘ + wheel (and trackpad pinches, which arrive as Ctrl + wheel) zoom around the pointer.
  // A native listener, because React's wheel events can't prevent the page from zooming.
  const latestPps = useRef(pps);
  useEffect(() => {
    latestPps.current = pps;
  }, [pps]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(latestPps.current * Math.exp(-e.deltaY / 200), e.clientX - el.getBoundingClientRect().left);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const down = (e: ReactPointerEvent<HTMLDivElement>, key: string, kind: MomentKind | "word", span: Span) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const edge = Math.min(EDGE, rect.width / 4);
    const edges = rect.width >= 24;
    const mode: DragMode = edges && x < edge ? "start" : edges && x > rect.width - edge ? "end" : "move";
    drag.current = { key, kind, mode, origin: span, x: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(key);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>, key: string, locked = false) => {
    const d = drag.current;
    if (!d || d.key !== key || locked) return;
    const delta = (e.clientX - d.x) / pps;
    if (d.kind === "word") onWordDrag(Number(key.slice(1)), d.origin, d.mode, delta);
    else onChange(d.key, dragSpan(d.origin, d.mode, delta, d.kind, duration, snaps), d.mode);
  };
  const seek = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(duration, (e.clientX - rect.left) / pps)));
  };
  const blockStyle = (top: number, start: number, end: number): CSSProperties => ({
    position: "absolute",
    top,
    left: start * pps,
    width: Math.max(10, (end - start) * pps),
    height: LANE_H - 8,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 6px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    cursor: "grab",
    touchAction: "none",
    boxSizing: "border-box",
  });
  const tick = pps >= 120 ? 0.5 : pps >= 30 ? 1 : pps >= 12 ? 5 : 10;

  return (
    <div style={{ margin: "12px 0" }}>
      <div className="actions" style={{ alignItems: "center" }}>
        <button type="button" className="secondary" aria-label="Zoom timeline out" onClick={() => zoomTo(pps / 1.5)}>−</button>
        <button type="button" className="secondary" onClick={() => zoomTo(fitZoom(box.current?.clientWidth ?? 600, duration), 0)}>Fit</button>
        <button type="button" className="secondary" aria-label="Zoom timeline in" onClick={() => zoomTo(pps * 1.5)}>+</button>
        <span className="muted">{showWords ? "Drag a word to retime it" : "Ctrl/⌘ + scroll or + to zoom; zoom in to retime words"}</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ paddingTop: 20, width: 64, flexShrink: 0 }}>
          {LANES.map((l) => (
            <div key={l.kind} className="muted" style={{ height: LANE_H, display: "flex", alignItems: "center", fontSize: 12 }}>
              {l.kind === "captions" && showWords ? "Words" : l.label}
            </div>
          ))}
        </div>
        <div ref={box} data-timeline style={{ overflowX: "auto", flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative", width, height: 20 + LANE_H * LANES.length, userSelect: "none" }} onPointerDown={seek}>
            {Array.from({ length: Math.floor(duration / tick) + 1 }, (_, i) => (
              <div key={i} className="muted" style={{ position: "absolute", left: i * tick * pps, top: 0, height: 20, borderLeft: "1px solid var(--border)", paddingLeft: 2, fontSize: 10, pointerEvents: "none" }}>
                {i % 2 === 0 ? `${tick < 1 ? (i * tick).toFixed(1) : i * tick}s` : ""}
              </div>
            ))}
            {LANES.map((l, i) => (
              <div key={l.kind} style={{ position: "absolute", left: 0, top: 20 + i * LANE_H, width, height: LANE_H, background: i % 2 ? "transparent" : "color-mix(in srgb, var(--border) 50%, transparent)" }} />
            ))}
            {showWords
              ? words.map((w, i) => (
                  <div
                    key={`w${i}`}
                    role="button"
                    aria-label={`Caption word ${w.word}, ${formatTime(w.start)} to ${formatTime(w.end)}`}
                    title="Drag to retime this word"
                    onPointerDown={(e) => down(e, `w${i}`, "word", { start: w.start, end: w.end })}
                    onPointerMove={(e) => move(e, `w${i}`)}
                    onPointerUp={() => (drag.current = null)}
                    style={{
                      ...blockStyle(20 + 3 * LANE_H + 4, w.start, w.end),
                      background: "var(--bg)",
                      color: "var(--fg)",
                      border: `${selected === `w${i}` ? 3 : 1}px solid ${selected === `w${i}` ? "var(--accent)" : "var(--muted)"}`,
                    }}>
                    {w.word}
                  </div>
                ))
              : lines.map((l) => (
                  <div
                    key={l.from}
                    role="button"
                    aria-label={`Caption line at ${formatTime(l.start)}: ${l.text}. Click to zoom in and retime its words.`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const to = clampZoom(Math.max(WORD_ZOOM * 1.4, pps), box.current?.clientWidth ?? 600, duration);
                      pending.current = Math.max(0, l.start * to - 24);
                      setPps(to);
                      onSeek(l.start);
                    }}
                    style={{ ...blockStyle(20 + 3 * LANE_H + 5, l.start, l.end), height: LANE_H - 10, border: "1px solid var(--border)", fontWeight: 400, cursor: "zoom-in" }}>
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
                  onPointerDown={(e) => down(e, m.key, m.kind, { start: m.start, end: m.end })}
                  onPointerMove={(e) => move(e, m.key, m.off)}
                  onPointerUp={() => (drag.current = null)}
                  style={{
                    ...blockStyle(20 + lane * LANE_H + 4, m.start, m.end),
                    background: m.off ? "transparent" : color,
                    color: m.kind === "zoom" ? "#fff" : "#111",
                    border: `${m.problem || selected === m.key ? 3 : 1}px ${m.off ? "dashed" : "solid"} ${m.problem ? "var(--danger)" : selected === m.key ? "var(--accent)" : color}`,
                    opacity: m.off ? 0.6 : 1,
                  }}>
                  {m.label}
                </div>
              );
            })}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: time * pps, width: 2, background: "#f27a5e", pointerEvents: "none" }} />
          </div>
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
