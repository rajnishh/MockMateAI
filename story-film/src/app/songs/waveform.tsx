"use client";

import { useRef } from "react";

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export interface Range {
  start: number;
  end: number;
}

// The song's waveform with a playhead, and optionally a part picked by dragging its two edges or the
// part itself. Both edges are sliders: arrow keys move them by half a second, Shift+arrow by 5.
export function Waveform(props: {
  peaks: number[] | null;
  durationSec: number;
  position?: number;
  onSeek?: (sec: number) => void;
  range?: Range;
  onRange?: (r: Range) => void;
  minSec?: number;
  maxSec?: number;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: "start" | "end" | "move"; x0: number; r0: Range } | null>(null);
  const { durationSec: dur, range, onRange, minSec = 1, maxSec = dur } = props;
  const peaks = props.peaks ?? Array.from({ length: 120 }, (_, i) => 0.25 + 0.15 * Math.sin(i / 3));
  const pct = (sec: number) => `${(Math.min(dur, Math.max(0, sec)) / dur) * 100}%`;

  const secAt = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    return Math.min(dur, Math.max(0, ((clientX - rect.left) / rect.width) * dur));
  };

  // Keeps a part inside the song and between minSec and maxSec long, moving the edge being dragged.
  function clamp(r: Range, moving: "start" | "end" | "move"): Range {
    const round = (x: number) => Math.round(x * 10) / 10;
    if (moving === "move") {
      const len = r.end - r.start;
      const start = Math.min(dur - len, Math.max(0, r.start));
      return { start: round(start), end: round(start + len) };
    }
    if (moving === "start") {
      const start = Math.min(r.end - minSec, Math.max(0, r.end - maxSec, r.start));
      return { start: round(Math.max(0, start)), end: r.end };
    }
    const end = Math.max(r.start + minSec, Math.min(dur, r.start + maxSec, r.end));
    return { start: r.start, end: round(Math.min(dur, end)) };
  }

  function down(kind: "start" | "end" | "move", e: React.PointerEvent) {
    if (!range) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, x0: e.clientX, r0: range };
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !onRange) return;
    const rect = box.current!.getBoundingClientRect();
    const delta = ((e.clientX - d.x0) / rect.width) * dur;
    const r = d.kind === "start" ? { ...d.r0, start: d.r0.start + delta } : d.kind === "end" ? { ...d.r0, end: d.r0.end + delta } : { start: d.r0.start + delta, end: d.r0.end + delta };
    onRange(clamp(r, d.kind));
  }

  function key(edge: "start" | "end", e: React.KeyboardEvent) {
    if (!range || !onRange) return;
    const step = e.shiftKey ? 5 : 0.5;
    const by: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -5, PageUp: 5 };
    let value = range[edge];
    if (e.key in by) value += by[e.key];
    else if (e.key === "Home") value = 0;
    else if (e.key === "End") value = dur;
    else return;
    e.preventDefault();
    onRange(clamp({ ...range, [edge]: value }, edge));
  }

  const inPart = (i: number) => {
    const at = ((i + 0.5) / peaks.length) * dur;
    return range ? at >= range.start && at <= range.end : props.position !== undefined && at <= props.position;
  };

  return (
    <div className="st-wave-wrap">
      <div
        ref={box}
        className={`st-wave${props.onSeek ? " seekable" : ""}`}
        onPointerDown={(e) => props.onSeek && !drag.current && props.onSeek(secAt(e.clientX))}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}>
        <svg viewBox={`0 0 ${peaks.length * 3} 100`} preserveAspectRatio="none" aria-hidden="true">
          {peaks.map((p, i) => {
            const h = Math.max(4, p * 96);
            return <rect key={i} x={i * 3 + 0.5} y={50 - h / 2} width={2} height={h} rx={1} className={inPart(i) ? "on" : ""} />;
          })}
        </svg>
        {props.position !== undefined && <div className="st-playhead" style={{ left: pct(props.position) }} />}
        {range && (
          <>
            <div className="st-part" style={{ left: pct(range.start), width: `calc(${pct(range.end)} - ${pct(range.start)})` }} onPointerDown={(e) => down("move", e)} />
            {(["start", "end"] as const).map((edge) => (
              <div
                key={edge}
                role="slider"
                tabIndex={0}
                aria-label={`${props.label ?? "Part"} ${edge}`}
                aria-valuemin={0}
                aria-valuemax={Math.round(dur)}
                aria-valuenow={Math.round(range[edge] * 10) / 10}
                aria-valuetext={fmt(range[edge])}
                className={`st-handle ${edge}`}
                style={{ left: pct(range[edge]) }}
                onPointerDown={(e) => down(edge, e)}
                onKeyDown={(e) => key(edge, e)}>
                <span />
              </div>
            ))}
          </>
        )}
      </div>
      <div className="st-wave-times">
        {range ? (
          <>
            <span>{fmt(range.start)}</span>
            <strong>{`${props.label ?? "Part"} · ${Math.round((range.end - range.start) * 10) / 10} s`}</strong>
            <span>{fmt(range.end)}</span>
          </>
        ) : (
          <>
            <span>{fmt(props.position ?? 0)}</span>
            <span>{fmt(dur)}</span>
          </>
        )}
      </div>
    </div>
  );
}
