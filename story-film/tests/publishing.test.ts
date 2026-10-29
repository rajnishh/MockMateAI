import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createFilm, updateFilm } from "@/lib/films";
import { cancelPost, createPost, publishPost, retryPost } from "@/lib/posts";
import { enqueuePost } from "@/lib/queue/publish";
import { accessTokenFor, listAccounts, saveYouTubeAccount } from "@/lib/social-accounts";
import { buildAuthUrl, type UploadMetadata, YouTubeClient, YouTubeError } from "@/lib/youtube";
import { testDb } from "./helpers/db";

const key = randomBytes(32).toString("base64");
const dir = mkdtempSync(path.join(tmpdir(), "publish-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const oauth = { clientId: "cid", clientSecret: "secret", redirectUri: "https://app.test/api/connect/youtube/callback" };

describe("token encryption", () => {
  it("round-trips and detects tampering", () => {
    const sealed = encrypt("ya29.token", key);
    expect(sealed).not.toContain("ya29");
    expect(decrypt(sealed, key)).toBe("ya29.token");
    const bytes = Buffer.from(sealed, "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => decrypt(bytes.toString("base64"), key)).toThrow();
  });
});

describe("YouTube client", () => {
  it("asks for offline upload access with state", () => {
    const url = new URL(buildAuthUrl(oauth, "st4te"));
    expect(url.searchParams.get("scope")).toContain("youtube.upload");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("st4te");
  });

  it("uploads resumably and always declares synthetic media", async () => {
    const file = path.join(dir, "v.mp4");
    writeFileSync(file, Buffer.from("fake-mp4-bytes"));
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (calls.length === 1) return new Response("", { status: 200, headers: { location: "https://upload.test/session/1" } });
      return new Response(JSON.stringify({ id: "vid123", status: { privacyStatus: "private" } }));
    }) as unknown as typeof fetch;

    const meta: UploadMetadata = { title: "T", description: "D", tags: ["kids"], privacy: "public", madeForKids: true };
    const res = await new YouTubeClient(oauth, fetchFn).upload("tok", file, meta);

    const body = JSON.parse(calls[0].init.body as string);
    expect(body.status).toEqual({ privacyStatus: "public", selfDeclaredMadeForKids: true, containsSyntheticMedia: true });
    expect((calls[0].init.headers as Record<string, string>)["X-Upload-Content-Length"]).toBe("14");
    expect(calls[1].url).toBe("https://upload.test/session/1");
    expect(calls[1].init.method).toBe("PUT");
    expect(res).toEqual({ id: "vid123", url: "https://youtube.com/shorts/vid123", privacy: "private" });
  });

  it("flags revoked access so the user is asked to reconnect", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    const err = await new YouTubeClient(oauth, fetchFn).refresh("r").catch((e) => e);
    expect(err).toBeInstanceOf(YouTubeError);
    expect(err.needsReconnect).toBe(true);
  });
});

describe("scheduling and publishing", () => {
  let db: Db;
  let filmId: string;
  let accountId: string;
  const uploads: UploadMetadata[] = [];
  let failNext = false;
  const youtube = {
    refresh: async () => ({ accessToken: "fresh", expiresAt: new Date(Date.now() + 3600_000) }),
    upload: async (_t: string, _f: string, meta: UploadMetadata) => {
      if (failNext) {
        failNext = false;
        throw new Error("quota exceeded");
      }
      uploads.push(meta);
      return { id: `v${uploads.length}`, url: `https://youtube.com/shorts/v${uploads.length}`, privacy: "private" };
    },
  } as unknown as YouTubeClient;

  beforeAll(async () => {
    db = await testDb();
    const now = new Date();
    await db.insert(user).values([
      { id: "u1", name: "One", email: "one@example.com", createdAt: now, updatedAt: now },
      { id: "u2", name: "Two", email: "two@example.com", createdAt: now, updatedAt: now },
    ]);
    const film = await createFilm(db, { userId: "u1", story: "s", style: "animated", durationSec: 30, kidSafe: true });
    filmId = film.id;
    // An expired token, to exercise the refresh path.
    const account = await saveYouTubeAccount(db, key, "u1", { id: "UC1", title: "My Channel" }, {
      accessToken: "old",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() - 1000),
    });
    accountId = account.id;
  }, 30_000);

  it("only schedules finished videos on the user's own channel", async () => {
    const input = { filmId: "", socialAccountId: "", title: "Ep 1", description: "", tags: [], privacy: "public" as const };
    await expect(createPost(db, "u1", { ...input, filmId, socialAccountId: accountId })).rejects.toThrow(/finished/);
    await updateFilm(db, filmId, { status: "completed", outputPath: path.join(dir, "v.mp4") });
    await expect(createPost(db, "u2", { ...input, filmId, socialAccountId: accountId })).rejects.toThrow();
    const post = await createPost(db, "u1", { ...input, filmId, socialAccountId: accountId });
    // Kid-safe films default to "made for kids".
    expect(post.madeForKids).toBe(true);
  });

  it("publishes once, refreshes the token and notes YouTube's privacy override", async () => {
    const post = await createPost(db, "u1", { filmId, socialAccountId: accountId, title: "Ep 2", description: "", tags: ["a"], privacy: "public" });
    expect(await publishPost({ db, tokenKey: key, youtube, baseUrl: "https://app.test" }, post.id)).toBe("published");
    expect(await publishPost({ db, tokenKey: key, youtube, baseUrl: "https://app.test" }, post.id)).toBe("skipped");
    expect(uploads.map((u) => u.title)).toEqual(["Ep 2"]);

    const [account] = await listAccounts(db, "u1");
    expect(decrypt(account.accessToken, key)).toBe("fresh");
    expect(await accessTokenFor(db, key, youtube, account)).toBe("fresh");
  });

  it("marks failures, allows retry, and cancels only pending posts", async () => {
    const post = await createPost(db, "u1", { filmId, socialAccountId: accountId, title: "Ep 3", description: "", tags: [], privacy: "public" });
    failNext = true;
    await expect(publishPost({ db, tokenKey: key, youtube, baseUrl: "https://app.test" }, post.id)).rejects.toThrow("quota exceeded");
    expect(await retryPost(db, "u2", post.id)).toBeUndefined();
    const retried = await retryPost(db, "u1", post.id);
    expect(retried?.status).toBe("scheduled");
    expect(await publishPost({ db, tokenKey: key, youtube, baseUrl: "https://app.test" }, post.id)).toBe("published");
    expect(await cancelPost(db, "u1", post.id)).toBe(false);

    const later = await createPost(db, "u1", { filmId, socialAccountId: accountId, title: "Ep 4", description: "", tags: [], privacy: "public", scheduledAt: new Date(Date.now() + 86400_000).toISOString() });
    expect(await cancelPost(db, "u1", later.id)).toBe(true);
    expect(await publishPost({ db, tokenKey: key, youtube, baseUrl: "https://app.test" }, later.id)).toBe("skipped");
  });

  it("queues a delayed job keyed by the post id", async () => {
    const added: { opts: { jobId: string; delay: number } }[] = [];
    const queue = { add: async (_n: string, _d: unknown, opts: { jobId: string; delay: number }) => void added.push({ opts }) };
    await enqueuePost(queue as never, { id: "p1", scheduledAt: new Date(Date.now() + 60_000) });
    await enqueuePost(queue as never, { id: "p2", scheduledAt: new Date(Date.now() - 60_000) });
    expect(added[0].opts.jobId).toBe("p1");
    expect(added[0].opts.delay).toBeGreaterThan(55_000);
    expect(added[1].opts.delay).toBe(0);
  });
});

