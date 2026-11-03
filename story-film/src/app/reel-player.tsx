"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./app-shell";

// Inline 9:16 player. Picture-in-picture keeps the reel playing in a corner while the creator
// writes a caption or schedules it (Chrome, Edge, Safari; hidden where the browser can't).
export function ReelPlayer({ src, title, autoPlay = false }: { src: string; title?: string | null; autoPlay?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [pipAvailable, setPipAvailable] = useState(false);
  const [inPip, setInPip] = useState(false);

  useEffect(() => {
    setPipAvailable(typeof document !== "undefined" && document.pictureInPictureEnabled === true);
    const v = video.current;
    if (!v) return;
    const enter = () => setInPip(true);
    const leave = () => setInPip(false);
    v.addEventListener("enterpictureinpicture", enter);
    v.addEventListener("leavepictureinpicture", leave);
    return () => {
      v.removeEventListener("enterpictureinpicture", enter);
      v.removeEventListener("leavepictureinpicture", leave);
    };
  }, []);

  async function togglePip() {
    const v = video.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement === v) await document.exitPictureInPicture();
      else {
        if (v.paused) await v.play().catch(() => undefined);
        await v.requestPictureInPicture();
      }
    } catch {
      // The browser said no (e.g. the video hasn't loaded yet); the inline player still works.
    }
  }

  return (
    <div className="reel-player">
      <video ref={video} src={src} controls playsInline preload="metadata" autoPlay={autoPlay} aria-label={title ?? "Your reel"} />
      {pipAvailable && (
        <button type="button" className="secondary small pip" onClick={togglePip} aria-pressed={inPip}>
          <Icon name="pip" size={18} /> {inPip ? "Back to page" : "Pop out"}
        </button>
      )}
    </div>
  );
}

async function signedLink(id: string): Promise<string | null> {
  const res = await fetch(`/api/films/${id}/link`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  return res.ok ? (data.url as string) : null;
}

// Download, share (the file where the browser can, else the link) and copy a link that works without signing in.
export function ReelActions({ id, title, beforeShare }: { id: string; title?: string | null; beforeShare?: () => Promise<void> }) {
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const name = `${(title ?? "reel").replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "reel"}.mp4`;

  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
    const probe = new File([new Blob()], "x.mp4", { type: "video/mp4" });
    setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
  }, []);

  async function share() {
    setSharing(true);
    setNote(null);
    try {
      await beforeShare?.();
      if (canShareFiles) {
        const blob = await (await fetch(`/api/films/${id}/video`)).blob();
        await navigator.share({ files: [new File([blob], name, { type: "video/mp4" })], title: title ?? undefined });
      } else {
        const url = await signedLink(id);
        if (!url) return setNote("Couldn't make a share link. Try Download instead.");
        await navigator.share({ url, title: title ?? undefined });
      }
    } catch {
      // Closed the share sheet; nothing to do.
    } finally {
      setSharing(false);
    }
  }

  async function copyLink() {
    setNote(null);
    const url = await signedLink(id);
    if (!url) return setNote("Couldn't make a link. Try Download instead.");
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied. It works for 2 hours, no sign-in needed.");
    } catch {
      setNote(url);
    }
  }

  return (
    <>
      <div className="actions">
        <a href={`/api/films/${id}/video`} download={name}>
          <button type="button">
            <Icon name="download" size={18} /> Download
          </button>
        </a>
        {canShare && (
          <button type="button" className="secondary" onClick={share} disabled={sharing}>
            <Icon name="share" size={18} /> {sharing ? "Opening…" : "Share"}
          </button>
        )}
        <button type="button" className="secondary" onClick={copyLink}>
          <Icon name="link" size={18} /> Copy link
        </button>
      </div>
      {note && <p className="muted" role="status">{note}</p>}
    </>
  );
}

// Two steps, so a reel is never deleted by one stray tap.
export function DeleteReel({ id, onDeleted, small = false }: { id: string; onDeleted: () => void; small?: boolean }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/films/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) return onDeleted();
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Couldn't delete this reel");
  }

  if (!asking) {
    return (
      <button type="button" className={`ghost danger${small ? " small" : ""}`} onClick={() => setAsking(true)} aria-label="Delete reel">
        <Icon name="trash" size={18} />
        {small ? null : " Delete"}
      </button>
    );
  }
  return (
    <div className="confirm" role="alertdialog" aria-label="Delete this reel?">
      <span>Delete this reel? Its scheduled posts are cancelled too. This can&apos;t be undone.</span>
      <div className="confirm-actions">
        <button type="button" className="danger-solid small" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
        <button type="button" className="secondary small" onClick={() => setAsking(false)} disabled={busy}>Keep it</button>
      </div>
      {error && <span className="muted" role="alert">{error}</span>}
    </div>
  );
}
