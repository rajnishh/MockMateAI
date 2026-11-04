"use client";

import { useEffect, useRef, useState } from "react";
import { type ClaudeTarget, claudeUrl } from "@/lib/claude-prompt";

const KEY = "reelkar.claudeTarget";

const TARGETS: { target: ClaudeTarget; label: string; help: string }[] = [
  { target: "desktop", label: "Claude Desktop app", help: "Opens a new chat in the app on this computer" },
  { target: "web", label: "Claude on the web", help: "Opens claude.ai in a new tab with the prompt filled in" },
  { target: "chrome", label: "Claude in Chrome", help: "Copies the prompt for the Claude side panel" },
];

const NOTE: Record<ClaudeTarget, string> = {
  desktop: "Opening Claude Desktop. The prompt is also copied: if the message box is empty, paste it and send.",
  web: "Opened Claude in a new tab. Check the prompt and send it.",
  chrome: "Prompt copied. Open Claude in Chrome (the Claude icon in your toolbar), paste the prompt and send it.",
};

function loadTarget(): ClaudeTarget | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "web" || v === "desktop" || v === "chrome" ? v : null;
  } catch {
    return null;
  }
}

function saveTarget(t: ClaudeTarget | null) {
  try {
    if (t) window.localStorage.setItem(KEY, t);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private windows can block storage; the menu then just asks each time.
  }
}

// "Build with Claude": asks where to open Claude (Desktop app, the web, or Claude in Chrome),
// optionally remembering the answer, and always copies the prompt as a fallback.
export function BuildWithClaude({ prompt }: { prompt: () => string }) {
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  const [saved, setSaved] = useState<ClaudeTarget | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Shown when the browser won't let the page copy: the prompt, ready to select and copy by hand.
  const [manual, setManual] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setSaved(loadTarget()), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function go(target: ClaudeTarget) {
    setOpen(false);
    if (remember) {
      saveTarget(target);
      setSaved(target);
    }
    const text = prompt();
    let copied = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      copied = false;
    }
    if (target === "web") window.open(claudeUrl(text, "web"), "_blank", "noopener");
    else if (target === "desktop") window.location.href = claudeUrl(text, "desktop");
    setManual(copied || target === "web" ? null : text);
    setNote(copied || target === "web" ? NOTE[target] : "Your browser didn't let Reelkar copy the prompt. Copy it from the box below, then paste it into Claude.");
  }

  return (
    <div className="acct claude-pick" ref={box}>
      <button
        type="button"
        className="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (saved ? go(saved) : setOpen((o) => !o))}
      >
        Build with Claude{saved ? ` · ${TARGETS.find((t) => t.target === saved)!.label.replace(/^Claude (on the )?/, "")}` : ""}
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Open Claude in">
          <p className="menu-who">Open Claude in…</p>
          {TARGETS.map((t) => (
            <button key={t.target} type="button" role="menuitem" onClick={() => go(t.target)}>
              <span>
                <b>{t.label}</b>
                <span className="muted claude-pick-help">{t.help}</span>
              </span>
            </button>
          ))}
          <label className="check claude-pick-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember my choice
          </label>
        </div>
      )}
      {saved && (
        <button
          type="button"
          className="link claude-pick-change"
          onClick={() => {
            saveTarget(null);
            setSaved(null);
            setOpen(true);
          }}
        >
          Change where Claude opens
        </button>
      )}
      {note && (
        <p className="muted" role="status">
          {note}
        </p>
      )}
      {manual && <textarea className="claude-pick-prompt" readOnly value={manual} aria-label="Prompt for Claude" onFocus={(e) => e.currentTarget.select()} rows={8} />}
    </div>
  );
}
