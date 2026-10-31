"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { AgentCard, PostingMode } from "@/lib/agent/cards";
import { Loader, ReelLogo } from "../reel-logo";

type Message = { id: string; role: "user" | "assistant"; text: string; cards: AgentCard[]; createdAt: string };

const MODES: { value: PostingMode; label: string; help: string }[] = [
  { value: "ask", label: "Ask me first", help: "I prepare each post; you approve it." },
  { value: "auto_schedule", label: "Auto-schedule", help: "I schedule posts at good times without asking." },
  { value: "auto_now", label: "Auto-post", help: "I post as soon as each reel is ready." },
];

const STARTERS = ["Give me 3 reel ideas for my topic", "Make a reel on my topic and post it tomorrow evening", "Plan my week: 3 reels, one a day"];

// Reels still being made, or posts waiting for them: keep refreshing.
const busy = (messages: Message[]) =>
  messages.some((m) => m.cards.some((c) => (c.type === "reel" && (c.status === "queued" || c.status === "running")) || ((c.type === "proposal" || c.type === "post") && c.status === "waiting")));

// The device's time zone goes with every request, so "tomorrow 7:30 pm" means the creator's evening.
// With no saved language, the agent answers in the language the creator writes in.
function turn() {
  return { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

async function send(path: string, body: unknown, method = "POST") {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<PostingMode>("ask");
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/agent");
    if (!res.ok) throw new Error("Couldn't load your conversation. Refresh to try again.");
    const data = await res.json();
    setMessages(data.messages);
    setMode(data.postingMode);
    setFreeLeft(data.freeLeft);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  useEffect(() => {
    if (!busy(messages)) return;
    const timer = setTimeout(() => load().catch(() => undefined), 5000);
    return () => clearTimeout(timer);
  }, [messages, load]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Runs a request that answers with the updated conversation.
  async function act(fn: () => Promise<{ messages: Message[] }>) {
    setSending(true);
    setError(null);
    try {
      setMessages((await fn()).messages);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function submit(e?: FormEvent, value = text) {
    e?.preventDefault();
    const t = value.trim();
    if (!t || sending) return;
    setText("");
    act(() => send("/api/agent", { ...turn(), text: t }));
  }

  async function changeMode(next: PostingMode) {
    setMode(next);
    await send("/api/agent/settings", { postingMode: next }, "PUT").catch((e) => setError((e as Error).message));
  }

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
    } catch {
      setError("Couldn't copy. Select the caption and copy it yourself.");
    }
  }

  function renderCard(c: AgentCard, key: string) {
    switch (c.type) {
      case "ideas":
        return (
          <div key={key} className="agent-card">
            <strong>Ideas</strong>
            {c.ideas.map((idea) => (
              <div key={idea.title} className="idea">
                <strong>{idea.title}</strong>
                <span className="muted">{idea.idea}</span>
                <button
                  type="button"
                  className="secondary"
                  disabled={sending}
                  onClick={() =>
                    act(() => send("/api/agent/actions", { ...turn(), name: "make_reel", input: { idea: `${idea.title}. ${idea.idea}`, title: idea.title, format: c.format, language: c.language }, label: `Make this: ${idea.title}` }))
                  }>
                  Make this
                </button>
              </div>
            ))}
          </div>
        );
      case "reel":
        return (
          <div key={key} className="agent-card row-card">
            <div className="grow">
              <strong>{c.title}</strong>
              <span className={`pill pill-${c.status}`}>{statusLabel(c.status)}</span>
              {c.note && <span className="muted">{c.note}</span>}
            </div>
            {(c.status === "queued" || c.status === "running") && <ReelLogo size={36} loop />}
            {c.status === "completed" && (
              <a href={`/api/films/${c.reelId}/video`} target="_blank" rel="noreferrer">
                Watch
              </a>
            )}
          </div>
        );
      case "reels":
        return (
          <div key={key} className="agent-card">
            {c.reels.length === 0 && <span className="muted">No reels yet.</span>}
            {c.reels.map((r) => (
              <div key={r.reelId} className="row-card">
                <span className="grow">{r.title}</span>
                <span className={`pill pill-${r.status}`}>{statusLabel(r.status)}</span>
              </div>
            ))}
          </div>
        );
      case "proposal":
        return (
          <div key={key} className="agent-card">
            <strong>{c.text}</strong>
            {c.status === "proposed" ? (
              <div className="actions">
                <button type="button" disabled={sending} onClick={() => act(() => send(`/api/agent/actions/${c.actionId}`, { ...turn(), approve: true }))}>
                  Approve
                </button>
                <button type="button" className="secondary" disabled={sending} onClick={() => act(() => send(`/api/agent/actions/${c.actionId}`, { ...turn(), approve: false }))}>
                  Cancel
                </button>
              </div>
            ) : (
              <span className="muted">
                {c.status === "waiting" ? "Approved · posts when the reel is ready" : c.status === "done" ? "Approved · scheduled" : c.status === "cancelled" ? "Cancelled" : "Couldn't post"}
              </span>
            )}
          </div>
        );
      case "post":
        return (
          <div key={key} className="agent-card flat">
            <span>{c.text}</span>
            <Link href="/calendar">See calendar</Link>
          </div>
        );
      case "caption":
        return (
          <div key={key} className="agent-card">
            <span className="muted">Caption for {c.platform}</span>
            <p className="caption-text">{c.text}</p>
            <button type="button" className="secondary" onClick={() => copy(key, c.text)}>
              {copied === key ? "Copied" : "Copy"}
            </button>
          </div>
        );
      case "connect":
        return (
          <div key={key} className="agent-card flat">
            <span>{c.text}</span>
            <Link href="/calendar">Connect accounts</Link>
          </div>
        );
      case "settings":
        return (
          <div key={key} className="agent-card flat">
            Posting is now: {MODES.find((m) => m.value === c.postingMode)?.label}
          </div>
        );
      case "credits":
        return (
          <div key={key} className="agent-card warn">
            <strong>Out of free reels</strong>
            <span>{c.text}</span>
            <Link href="/billing">Get credits</Link>
          </div>
        );
      case "error":
        return (
          <div key={key} className="agent-card warn" role="alert">
            {c.text}
          </div>
        );
    }
  }

  return (
    <main className="ask">
      <header className="top">
        <div className="brand">
          <ReelLogo size={36} label="Reelkar" />
          <h1>Ask Reelkar</h1>
        </div>
        <Link href="/">Back to studio</Link>
      </header>
      <p className="muted">{freeLeft === null ? "Tell me what to make or post, in any language." : `${freeLeft} free reels left this week. Tell me what to make or post, in any language.`}</p>

      <fieldset className="modes">
        <legend>When I post for you</legend>
        <div className="tabs">
          {MODES.map((m) => (
            <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => changeMode(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
        <span className="muted">{MODES.find((m) => m.value === mode)?.help}</span>
      </fieldset>

      <div className="chat" aria-live="polite">
        {!loaded && !error && <Loader label="Loading your conversation…" />}
        {loaded && messages.length === 0 && (
          <div className="agent-card">
            <strong>Namaste! What should we make?</strong>
            <span className="muted">Type in any language. Try:</span>
            {STARTERS.map((s) => (
              <button key={s} type="button" className="secondary" onClick={() => submit(undefined, s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`turn ${m.role}`}>
            {m.text && <div className={`bubble ${m.role}`}>{m.text}</div>}
            {m.cards.map((c, i) => renderCard(c, `${m.id}-${i}`))}
          </div>
        ))}
        {sending && <Loader label="Working on it…" />}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div ref={end} />
      </div>

      <form className="composer" onSubmit={submit}>
        <label htmlFor="ask-text" className="sr-only">
          Message Ask Reelkar
        </label>
        <textarea
          id="ask-text"
          value={text}
          maxLength={1000}
          placeholder="e.g. kal shaam ke liye chai pe reel banao"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
        />
        <button type="submit" disabled={!text.trim() || sending}>
          Send
        </button>
      </form>
    </main>
  );
}

function statusLabel(status: string) {
  return status === "completed" ? "Ready" : status === "failed" ? "Failed" : status === "review" ? "Check effects" : "Making";
}
