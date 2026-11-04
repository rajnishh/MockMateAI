import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { connectResultUrl, readConnectState } from "@/lib/connect";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createFilm, updateFilm } from "@/lib/films";
import { buildInstagramAuthUrl, InstagramClient, InstagramError } from "@/lib/instagram";
import { createPost, publishPost } from "@/lib/posts";
import { filmIdFromVideoToken, publicVideoUrl } from "@/lib/public-video";
import { signToken, verifyToken } from "@/lib/signed";
import { accountView, instagramTokenFor, listAccounts, saveInstagramAccount } from "@/lib/social-accounts";
import { loadEnv } from "@/lib/env";
import { testDb } from "./helpers/db";

const key = randomBytes(32).toString("base64");
const app = { appId: "123", appSecret: "shh", redirectUri: "https://app.test/api/connect/instagram/callback" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("signed tokens", () => {
  it("round-trips, rejects tampering, other purposes and expiry", () => {
    const t = signToken({ uid: "u1" }, key, "connect", 60);
    expect(verifyToken<{ uid: string }>(t, key, "connect")?.uid).toBe("u1");
    expect(verifyToken(t, key, "video")).toBeNull();
    // Flip the first signature character (the last one only carries padding bits).
    const [body, sig] = t.split(".");
    expect(verifyToken(`${body}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`, key, "connect")).toBeNull();
    expect(verifyToken(`${body.slice(0, -1)}${body.at(-1) === "A" ? "B" : "A"}.${sig}`, key, "connect")).toBeNull();
    expect(verifyToken(signToken({ uid: "u1" }, key, "connect", -1), key, "connect")).toBeNull();
    expect(verifyToken(t, randomBytes(32).toString("base64"), "connect")).toBeNull();
  });

  it("makes expiring public video links for one film", () => {
    const url = publicVideoUrl("https://app.test", key, "film-1");
    expect(url).toMatch(/^https:\/\/app\.test\/api\/public\/video\/.+\.mp4$/);
    expect(filmIdFromVideoToken(url.split("/").pop()!, key)).toBe("film-1");
    expect(filmIdFromVideoToken("forged.mp4", key)).toBeNull();
  });

  it("reads a connect state only for its platform and sends the app back to its scheme", () => {
    const env = loadEnv({ TOKEN_ENCRYPTION_KEY: key });
    const state = signToken({ uid: "u9", p: "instagram", r: "app" }, key, "connect", 60);
    expect(readConnectState(env, "instagram", state)?.uid).toBe("u9");
    expect(readConnectState(env, "youtube", state)).toBeNull();
    expect(connectResultUrl("https://app.test", "app", "instagram")).toBe("reelkar://connected?platform=instagram&connected=instagram");
    expect(connectResultUrl("https://app.test", "web", "youtube", "denied")).toBe("https://app.test/calendar?platform=youtube&error=denied");
  });
});

describe("Instagram client", () => {
  it("asks only for basic and publish permissions", () => {
    const url = new URL(buildInstagramAuthUrl(app, "st"));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
    expect(url.searchParams.get("state")).toBe("st");
  });

  it("exchanges the code (dropping #_) for a long-lived token", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body?.toString() });
      if (url.startsWith("https://api.instagram.com")) return json({ data: [{ access_token: "short", user_id: 42, permissions: "x" }] });
      return json({ access_token: "long", token_type: "bearer", expires_in: 5_184_000 });
    }) as unknown as typeof fetch;
    const res = await new InstagramClient(app, fetchFn).exchangeCode("abc#_");
    expect(new URLSearchParams(calls[0].body).get("code")).toBe("abc");
    expect(calls[1].url).toContain("graph.instagram.com/access_token?grant_type=ig_exchange_token");
    expect(res.userId).toBe("42");
    expect(res.token.accessToken).toBe("long");
    expect(res.token.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);
  });

  it("publishes a reel after the container finishes processing", async () => {
    const calls: string[] = [];
    let polls = 0;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
      if (url.endsWith("/77/media")) {
        const body = new URLSearchParams(init!.body!.toString());
        expect(body.get("media_type")).toBe("REELS");
        expect(body.get("video_url")).toBe("https://app.test/v.mp4");
        return json({ id: "c1" });
      }
      if (url.includes("/c1?")) return json({ status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" });
      if (url.endsWith("/77/media_publish")) return json({ id: "m1" });
      return json({ permalink: "https://www.instagram.com/reel/abc/" });
    }) as unknown as typeof fetch;
    const res = await new InstagramClient(app, fetchFn, async () => {}).publishReel("tok", "77", "https://app.test/v.mp4", "Hello");
    expect(res).toEqual({ id: "m1", url: "https://www.instagram.com/reel/abc/" });
    expect(polls).toBe(2);
    expect(calls.at(-2)).toBe("POST https://graph.instagram.com/v26.0/77/media_publish");
  });

  it("stops on processing errors and flags expired tokens", async () => {
    const failing = (async (url: string) => (url.includes("/c1?") ? json({ status_code: "ERROR" }) : json({ id: "c1" }))) as unknown as typeof fetch;
    await expect(new InstagramClient(app, failing, async () => {}).publishReel("t", "77", "u", "c")).rejects.toThrow(/ERROR/);
    const expired = (async () => json({ error: { message: "Session expired", code: 190 } }, 400)) as unknown as typeof fetch;
    const err = await new InstagramClient(app, expired).getProfile("t").catch((e) => e);
    expect(err).toBeInstanceOf(InstagramError);
    expect(err.needsReconnect).toBe(true);
  });
});

describe("publishing to Instagram", () => {
  let db: Db;
  beforeAll(async () => {
    db = await testDb();
    const now = new Date();
    await db.insert(user).values({ id: "ig1", name: "Insta", email: "ig@example.com", createdAt: now, updatedAt: now });
  }, 30_000);

  it("posts the reel with its caption from a signed public link", async () => {
    const f = await createFilm(db, { userId: "ig1", story: "s", style: "animated", durationSec: 30, kidSafe: false });
    await updateFilm(db, f.id, { status: "completed", outputPath: "/tmp/never-read.mp4" });
    const account = await saveInstagramAccount(db, key, "ig1", { id: "1784", username: "priyacooks" }, { accessToken: "long", expiresAt: new Date(Date.now() + 50 * 86400_000) });
    expect(accountView(account)).toMatchObject({ platform: "instagram", name: "@priyacooks", needsReconnect: false });

    const published: { token: string; user: string; url: string; caption: string }[] = [];
    const instagram = {
      publishReel: async (token: string, igUser: string, url: string, caption: string) => {
        published.push({ token, user: igUser, url, caption });
        return { id: "m9", url: "https://www.instagram.com/reel/m9/" };
      },
    } as unknown as InstagramClient;

    await expect(createPost(db, "ig1", { filmId: f.id, socialAccountId: account.id, title: "T", description: "x".repeat(2201), tags: [], privacy: "public" })).rejects.toThrow(/2,200/);
    const post = await createPost(db, "ig1", { filmId: f.id, socialAccountId: account.id, title: "Chai hacks", description: "3 chai hacks #reels", tags: [], privacy: "public" });
    expect(await publishPost({ db, tokenKey: key, instagram, baseUrl: "https://app.test" }, post.id)).toBe("published");
    expect(published[0]).toMatchObject({ token: "long", user: "1784", caption: "3 chai hacks #reels" });
    expect(filmIdFromVideoToken(published[0].url.split("/").pop()!, key)).toBe(f.id);
  });

  it("refreshes tokens in their last 10 days and refuses expired ones", async () => {
    const [account] = await listAccounts(db, "ig1");
    const ig = { refresh: async () => ({ accessToken: "renewed", expiresAt: new Date(Date.now() + 60 * 86400_000) }) } as unknown as InstagramClient;
    expect(await instagramTokenFor(db, key, ig, account)).toBe("long");
    expect(await instagramTokenFor(db, key, ig, { ...account, expiresAt: new Date(Date.now() + 5 * 86400_000) })).toBe("renewed");
    await expect(instagramTokenFor(db, key, ig, { ...account, expiresAt: new Date(Date.now() - 1000) })).rejects.toThrow(/expired/);
  });
});
