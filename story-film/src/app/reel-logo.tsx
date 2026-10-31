import type { ReactNode } from "react";

// The Reelkar reel (design/v1.0 logo, animated by .lg rules in globals.css). Colours come from
// the theme tokens, so it turns neon in dark mode.
export function ReelLogo({ size = 40, loop = false, label }: { size?: number; loop?: boolean; label?: string }) {
  const fill = (v: string) => ({ fill: `var(${v})` });
  return (
    <svg className={`lg${loop ? " loop" : ""}`} width={size} height={size} viewBox="0 0 112 112" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect width="112" height="112" rx="30" style={fill("--logo-tile")} />
      <rect className="lg-tail" x="56" y="80" width="36" height="8" rx="4" style={fill("--logo-tail")} />
      <g className="lg-reel">
        <circle cx="54" cy="54" r="32" style={fill("--logo-reel")} />
        {[
          [54, 36],
          [71, 48],
          [65, 68],
          [43, 68],
          [37, 48],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="6" style={fill("--logo-tile")} />
        ))}
      </g>
      <circle className="lg-hub" cx="54" cy="54" r="5" style={fill("--logo-hub")} />
    </svg>
  );
}

// Loading: the reel spins; long waits (a reel being made) add pulsing rings.
export function Loader({ label, long }: { label: string; long?: boolean }) {
  return (
    <div className="loader" role="status">
      {long ? (
        <span className="halo">
          <i />
          <i />
          <ReelLogo size={64} loop />
        </span>
      ) : (
        <ReelLogo size={48} loop />
      )}
      <span>{label}</span>
    </div>
  );
}

// The finished video with one ring burst and a little confetti.
export function Celebrate({ children }: { children: ReactNode }) {
  const colours = ["var(--accent)", "var(--teal)", "#ffd23f", "#ffffff"];
  return (
    <div className="celebrate">
      {children}
      <span className="burst" aria-hidden="true" />
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="bit" aria-hidden="true" style={{ left: `${4 + i * 7}%`, background: colours[i % 4], animationDelay: `${(i % 5) * 0.12}s` }} />
      ))}
    </div>
  );
}
