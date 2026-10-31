"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ReelLogo } from "../reel-logo";

type Key = { id: string; name: string; hint: string; createdAt: string; lastUsedAt: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Never");

// Lets a creator connect Claude, Cursor or another AI assistant to Reelkar with a personal key.
export default function ConnectPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("Claude on my laptop");
  const [fresh, setFresh] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/tokens");
    if (!res.ok) throw new Error("Couldn't load your keys. Refresh to try again.");
    setKeys((await res.json()).tokens);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't create the key.");
    setFresh(data.token);
    load().catch(() => undefined);
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) return setError("Couldn't remove the key.");
    setKeys((k) => k.filter((x) => x.id !== id));
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setError("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  const url = `${origin}/api/mcp`;
  const key = fresh ?? "YOUR_KEY";
  const steps = [
    { id: "claude-code", title: "Claude Code", text: `claude mcp add --transport http reelkar ${url} --header "Authorization: Bearer ${key}"` },
    {
      id: "claude-desktop",
      title: "Claude Desktop (Settings → Developer → Edit config)",
      text: JSON.stringify({ mcpServers: { reelkar: { command: "npx", args: ["-y", "mcp-remote", url, "--header", `Authorization: Bearer ${key}`] } } }, null, 2),
    },
    { id: "cursor", title: "Cursor (Settings → MCP → Add new server)", text: JSON.stringify({ mcpServers: { reelkar: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2) },
  ];

  return (
    <main className="ask">
      <header className="top">
        <div className="brand">
          <ReelLogo size={36} label="Reelkar" />
          <h1>Connect an AI assistant</h1>
        </div>
        <Link href="/">Back to studio</Link>
      </header>
      <p className="muted">
        Use Reelkar from Claude, Cursor or another assistant you already pay for. It can suggest ideas, make reels, write captions and post them. Your posting setting
        (&ldquo;ask me first&rdquo; and so on) and your free reels apply exactly as in the app, and everything it does shows up in <Link href="/ask">Ask Reelkar</Link>.
      </p>

      <form className="agent-card" onSubmit={create}>
        <strong>1. Create a key</strong>
        <label htmlFor="key-name">Name it after where you&apos;ll use it</label>
        <input id="key-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "inherit", font: "inherit" }} />
        <button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create key"}
        </button>
        {fresh && (
          <div className="agent-card flat" role="status">
            <strong>Copy your key now. It won&apos;t be shown again.</strong>
            <p className="caption-text" style={{ fontFamily: "ui-monospace, monospace" }}>
              {fresh}
            </p>
            <button type="button" className="secondary" onClick={() => copy("key", fresh)}>
              {copied === "key" ? "Copied" : "Copy key"}
            </button>
          </div>
        )}
      </form>

      <div className="agent-card">
        <strong>2. Add Reelkar to your assistant</strong>
        <span className="muted">{fresh ? "Your new key is already filled in below." : "Replace YOUR_KEY with the key you created."}</span>
        {steps.map((s) => (
          <div key={s.id} className="idea">
            <strong>{s.title}</strong>
            <pre className="caption-text" style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, overflowX: "auto", whiteSpace: "pre" }}>
              {s.text}
            </pre>
            <button type="button" className="secondary" onClick={() => copy(s.id, s.text)}>
              {copied === s.id ? "Copied" : "Copy"}
            </button>
          </div>
        ))}
        <span className="muted">Then ask, for example: &ldquo;Use Reelkar to make a Hindi reel about monsoon recipes and post it tomorrow at 7:30 pm.&rdquo;</span>
        <span className="muted">ChatGPT and Claude on the web connect with a sign-in button instead of a key; that comes with the next update.</span>
      </div>

      <div className="agent-card">
        <strong>Your keys</strong>
        {keys.length === 0 && <span className="muted">No keys yet.</span>}
        {keys.map((k) => (
          <div key={k.id} className="row-card">
            <div className="grow">
              <span>
                {k.name} <span className="muted">· ends in {k.hint}</span>
              </span>
              <span className="muted">Last used: {when(k.lastUsedAt)}</span>
            </div>
            <button type="button" className="secondary" onClick={() => revoke(k.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
