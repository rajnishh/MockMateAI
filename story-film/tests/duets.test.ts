import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getBalance, grantCredits } from "@/lib/billing/credits";
import type { Db } from "@/lib/db";
import { socialAccount, song, user } from "@/lib/db/schema";
import {
  approveDuet,
  askRetake,
  cancelDuet,
  collabAllowed,
  declineDuet,
  DUET_CREDITS,
  type Duet,
  HALF_CREDITS,
  SOLO_CREDITS,
  duetView,
  extendDuet,
  dueReminders,
  finishSolo,
  inviteByHandle,
  joinArgs,
  joinDuet,
  type MakeDeps,
  phaseOf,
  reinviteDuet,
  retakePart,
  savePart,
  setPartVoice,
  startDuet,
  startJoin,
  viewerOf,
} from "@/lib/duets";
import { singDuetVoices } from "@/lib/duet-voice";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { savePushToken, sendPush } from "@/lib/push";
import { saveVoice } from "@/lib/voice/profiles";
import { execFileSync } from "node:child_process";
import { createFilm, updateFilm } from "@/lib/films";
import { createPost } from "@/lib/posts";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers/db";

const dir = mkdtempSync(path.join(tmpdir(), "duet-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const take = path.join(dir, "take.mp3");
writeFileSync(take, "fake mp3");

const HOUR = 3600 * 1000;

async function setup(): Promise<Db> {
  const db = await testDb();
  const now = new Date();
  await db.insert(user).values([
    { id: "arjun", name: "Arjun", email: "a@example.com", createdAt: now, updatedAt: now },
    { id: "sana", name: "Sana", email: "s@example.com", createdAt: now, updatedAt: now },
    { id: "omar", name: "Omar", email: "o@example.com", createdAt: now, updatedAt: now },
  ]);
  for (const id of ["arjun", "sana", "omar"]) await grantCredits(db, id, 20, "grant", `welcome:${id}`);
  return db;
}

type Job = { songId: string; credits: number; lyrics?: string; voices?: unknown };
function deps(jobs: Job[] = []): MakeDeps {
  return {
    outputDir: dir,
    ffmpeg: async () => undefined,
    writeLyrics: async (topic) => `[Verse]\nAI lines about ${topic}\n[Chorus]`,
    tuneCall: (input) => ({ kind: "cover", input: { audioUrl: input.takeMp3, style: input.vocal, originalStyle: "", lyrics: input.lyrics, originalLyrics: "" } }),
    queue: async (job) => {
      jobs.push({ songId: job.songId, credits: job.credits, lyrics: (job.call.input as { lyrics: string }).lyrics, voices: job.voices });
    },
  };
}

const start = (db: Db) => startDuet(db, "arjun", { topic: "Chai vs coffee", genre: "pop", language: "hi", name: "Arjun", ig: "arjun.sings" });
const part = (kind: "hum" | "sing", transcript = "") => ({ mp3: take, kind, transcript, durationSec: 20 });

async function bothIn(db: Db, opts: { split?: boolean } = {}): Promise<{ d: Duet; jobs: { songId: string; credits: number; lyrics?: string }[] }> {
  let d = await start(db);
  d = await savePart(db, dir, d, "a", part("sing", "Chai is my morning love"));
  d = await joinDuet(db, d, "sana", { name: "Sana", ig: "@Sana.Sings", split: opts.split ?? false });
  d = await savePart(db, dir, d, "b", part("hum"));
  const jobs: { songId: string; credits: number; lyrics?: string }[] = [];
  d = await startJoin(db, deps(jobs), d);
  return { d, jobs };
}

async function songDone(db: Db, d: Duet, status: "completed" | "failed" = "completed") {
  await db.update(song).set({ status, outputPath: status === "completed" ? take : null }).where(eq(song.id, d.songId!));
}

describe("starting and inviting", () => {
  it("takes the price from the starter, and refuses without enough credits", async () => {
    const db = await setup();
    const d = await start(db);
    expect(await getBalance(db, "arjun")).toBe(20 - DUET_CREDITS);
    expect(phaseOf(d, null)).toBe("recording_a");
    for (let left = 20 - DUET_CREDITS; left >= DUET_CREDITS; left -= DUET_CREDITS) await start(db);
    await expect(start(db)).rejects.toMatchObject({ status: 402, needCredits: true });
  });

  it("opens a 48-hour window once the first part is in", async () => {
    const db = await setup();
    const now = new Date("2026-11-06T10:00:00Z");
    const d = await savePart(db, dir, await start(db), "a", part("hum"), now);
    expect(d.expiresAt?.toISOString()).toBe("2026-11-08T10:00:00.000Z");
    expect(phaseOf(d, null, new Date(now.getTime() + 47 * HOUR))).toBe("waiting");
    expect(phaseOf(d, null, new Date(now.getTime() + 49 * HOUR))).toBe("expired");
  });

  it("lets one partner in, never the starter, and strips the @", async () => {
    const db = await setup();
    const d = await savePart(db, dir, await start(db), "a", part("hum"));
    await expect(joinDuet(db, d, "arjun", { name: "Arjun", ig: "", split: false })).rejects.toThrow(/your own/);
    const joined = await joinDuet(db, d, "sana", { name: "Sana", ig: "@sana.sings", split: false });
    expect(joined).toMatchObject({ partnerId: "sana", partnerIg: "sana.sings" });
    await expect(joinDuet(db, joined, "omar", { name: "Omar", ig: "", split: false })).rejects.toMatchObject({ status: 409 });
  });

  it("won't let anyone join before the first part or after the window", async () => {
    const db = await setup();
    const d = await start(db);
    await expect(joinDuet(db, d, "sana", { name: "Sana", ig: "", split: false })).rejects.toMatchObject({ status: 410 });
    const recorded = await savePart(db, dir, d, "a", part("hum"), new Date(Date.now() - 49 * HOUR));
    await expect(joinDuet(db, recorded, "sana", { name: "Sana", ig: "", split: false })).rejects.toMatchObject({ status: 410 });
  });
});

describe("joining the two parts", () => {
  it("makes one song on both tunes, owned by the starter, with nothing to refund", async () => {
    const db = await setup();
    const { d, jobs } = await bothIn(db);
    expect(phaseOf(d, "queued")).toBe("joining");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].credits).toBe(0);
    // A sang words (kept); B hummed (AI writes B's lines for the topic).
    expect(jobs[0].lyrics).toBe("[Verse 1]\nChai is my morning love\n\n[Verse 2]\nAI lines about Chai vs coffee");
    await songDone(db, d);
    expect(phaseOf(d, "completed")).toBe("ready");
  });

  it("splits the price when the partner offers half", async () => {
    const db = await setup();
    const { d } = await bothIn(db, { split: true });
    expect(await getBalance(db, "sana")).toBe(20 - HALF_CREDITS);
    expect(await getBalance(db, "arjun")).toBe(20 - (DUET_CREDITS - HALF_CREDITS));
    expect(d).toMatchObject({ paidA: DUET_CREDITS - HALF_CREDITS, paidB: HALF_CREDITS });
  });

  it("joins the parts back to back with ffmpeg", () => {
    expect(joinArgs("/a.mp3", "/b.mp3", "/out.mp3")).toEqual(expect.arrayContaining(["-i", "/a.mp3", "/b.mp3", "/out.mp3"]));
  });
});

describe("preview, retakes and approval", () => {
  it("needs both to approve before a Collab post, and only with the partner's own handle", async () => {
    const db = await setup();
    let { d } = await bothIn(db);
    await songDone(db, d);
    d = await approveDuet(db, d, "a");
    expect(collabAllowed(d, "sana.sings")).toBe(false);
    d = await approveDuet(db, d, "b");
    expect(collabAllowed(d, "@Sana.Sings")).toBe(true);
    expect(collabAllowed(d, "someone.else")).toBe(false);
  });

  it("gives one free retake each, then charges; a retake resets both approvals", async () => {
    const db = await setup();
    let { d } = await bothIn(db);
    await songDone(db, d);
    d = await approveDuet(db, d, "a");
    d = await retakePart(db, d, "b", "sana");
    expect(d).toMatchObject({ partBPath: null, approvedA: null, retakesB: 1 });
    expect(phaseOf(d, "completed")).toBe("waiting");
    expect(await getBalance(db, "sana")).toBe(20);
    d = await savePart(db, dir, d, "b", part("sing", "Coffee wins"));
    d = await startJoin(db, deps(), d);
    await songDone(db, d);
    d = await retakePart(db, d, "b", "sana");
    expect(await getBalance(db, "sana")).toBe(19);
  });

  it("asks the other person to sing again", async () => {
    const db = await setup();
    let { d } = await bothIn(db);
    await songDone(db, d);
    d = await askRetake(db, d, "a");
    expect(duetView(d, "b", "completed", "https://r.app").askedToRetake).toBe(true);
    expect(duetView(d, "a", "completed", "https://r.app").askedToRetake).toBe(false);
  });

  it("can try a failed join again", async () => {
    const db = await setup();
    const { d } = await bothIn(db);
    await songDone(db, d, "failed");
    expect(phaseOf(d, "failed")).toBe("join_failed");
    const again = await startJoin(db, deps(), d);
    expect(again.songId).not.toBe(d.songId);
  });
});

describe("no answer, declined or cancelled", () => {
  it("gives 24 more hours once, after the 48", async () => {
    const db = await setup();
    const t0 = new Date("2026-11-06T10:00:00Z");
    let d = await savePart(db, dir, await start(db), "a", part("hum"), t0);
    await expect(extendDuet(db, d, new Date(t0.getTime() + HOUR))).rejects.toThrow();
    const late = new Date(t0.getTime() + 50 * HOUR);
    d = await extendDuet(db, d, late);
    expect(phaseOf(d, null, late)).toBe("waiting");
    await expect(extendDuet(db, d, new Date(late.getTime() + 25 * HOUR))).rejects.toThrow(/once/);
  });

  it("invites someone else with a new link, giving the first partner's half back", async () => {
    const db = await setup();
    let d = await savePart(db, dir, await start(db), "a", part("hum"));
    d = await joinDuet(db, d, "sana", { name: "Sana", ig: "", split: true });
    expect(await getBalance(db, "sana")).toBe(20 - HALF_CREDITS);
    const again = await reinviteDuet(db, d);
    expect(again.token).not.toBe(d.token);
    expect(again).toMatchObject({ partnerId: null, paidB: 0 });
    expect(await getBalance(db, "sana")).toBe(20);
    expect(await joinDuet(db, again, "omar", { name: "Omar", ig: "", split: false })).toMatchObject({ partnerId: "omar" });
  });

  it("declining refunds the partner and keeps their note for the starter", async () => {
    const db = await setup();
    let d = await savePart(db, dir, await start(db), "a", part("hum"));
    d = await joinDuet(db, d, "sana", { name: "Sana", ig: "", split: true });
    d = await declineDuet(db, d, "sana", "Exams this week!");
    expect(phaseOf(d, null)).toBe("declined");
    expect(d.declineNote).toBe("Exams this week!");
    expect(await getBalance(db, "sana")).toBe(20);
  });

  it("finishing solo costs a song on your tune and returns the rest", async () => {
    const db = await setup();
    const jobs: { songId: string; credits: number }[] = [];
    let d = await savePart(db, dir, await start(db), "a", part("hum"), new Date(Date.now() - 49 * HOUR));
    d = await finishSolo(db, deps(jobs), d);
    expect(d.status).toBe("solo");
    expect(jobs[0].credits).toBe(SOLO_CREDITS);
    expect(await getBalance(db, "arjun")).toBe(20 - SOLO_CREDITS);
  });

  it("cancelling gives everyone everything back", async () => {
    const db = await setup();
    let d = await savePart(db, dir, await start(db), "a", part("hum"));
    d = await joinDuet(db, d, "sana", { name: "Sana", ig: "", split: true });
    d = await cancelDuet(db, d);
    expect(phaseOf(d, null)).toBe("cancelled");
    expect(await getBalance(db, "arjun")).toBe(20);
    expect(await getBalance(db, "sana")).toBe(20);
  });
});

describe("Instagram Collab posts", () => {
  it("only name an approved partner, from an approved duet's music video", async () => {
    const db = await setup();
    let { d } = await bothIn(db);
    await songDone(db, d);
    const f = await createFilm(db, { userId: "arjun", story: "Chai vs coffee", style: "animated", durationSec: 30, songId: d.songId });
    await updateFilm(db, f.id, { status: "completed", outputPath: take });
    const [acct] = await db
      .insert(socialAccount)
      .values({ userId: "arjun", platform: "instagram", externalId: "77", name: "arjun.sings", accessToken: "x", refreshToken: "x", expiresAt: new Date() })
      .returning();
    const post = { filmId: f.id, socialAccountId: acct.id, title: "Chai vs coffee", description: "", tags: [], privacy: "public" as const, collaborators: ["sana.sings"] };
    await expect(createPost(db, "arjun", post)).rejects.toThrow(/both approved/);
    d = await approveDuet(db, await approveDuet(db, d, "a"), "b");
    expect((await createPost(db, "arjun", post)).collaborators).toEqual(["sana.sings"]);
    await expect(createPost(db, "arjun", { ...post, collaborators: ["random.person"] })).rejects.toThrow(/both approved/);
  });
});

describe("a join that fails to start", () => {
  it("keeps both parts and offers to try again", async () => {
    const db = await setup();
    let d = await savePart(db, dir, await start(db), "a", part("hum"));
    d = await joinDuet(db, d, "sana", { name: "Sana", ig: "", split: false });
    d = await savePart(db, dir, d, "b", part("hum"));
    const broken = { ...deps(), ffmpeg: async () => Promise.reject(new Error("ffmpeg died")) };
    await expect(startJoin(db, broken, d)).rejects.toThrow(/ffmpeg/);
    expect(phaseOf(d, null)).toBe("join_failed");
    expect((await startJoin(db, deps(), d)).status).toBe("joining");
  });
});

describe("inviting by Instagram username", () => {
  it("finds the Reelkar account that connected it, shows them the invite, and lets them join", async () => {
    const db = await setup();
    await db.insert(socialAccount).values({ userId: "sana", platform: "instagram", externalId: "88", name: "@Sana.Sings", accessToken: "x", refreshToken: "x", expiresAt: new Date() });
    let d = await savePart(db, dir, await start(db), "a", part("hum"));
    await expect(inviteByHandle(db, d, "@nobody.here")).rejects.toMatchObject({ status: 404 });
    d = await inviteByHandle(db, d, "@sana.sings");
    expect(d).toMatchObject({ invitedUserId: "sana", invitedIg: "sana.sings" });
    expect(viewerOf(d, "sana")).toBe("invited");
    expect(viewerOf(d, "omar")).toBeNull();
    d = await joinDuet(db, d, "sana", { name: "Sana", ig: "sana.sings", split: false });
    expect(viewerOf(d, "sana")).toBe("b");
  });
});

describe("own voices for parts", () => {
  async function voice(db: Db, userId: string) {
    return saveVoice(db, { userId, name: "Me", samplePath: take, durationSec: 20, consentText: "I consent", consentCode: "1234", transcript: "my code is 1234" });
  }

  it("charges for your own voice, gives it back when switched off, and sends both samples to the join", async () => {
    const db = await setup();
    const va = await voice(db, "arjun");
    const vb = await voice(db, "sana");
    let d = await savePart(db, dir, await start(db), "a", part("hum"));
    d = await setPartVoice(db, d, "a", "arjun", va.id);
    expect(await getBalance(db, "arjun")).toBe(20 - DUET_CREDITS - 4);
    d = await setPartVoice(db, d, "a", "arjun", null);
    expect(await getBalance(db, "arjun")).toBe(20 - DUET_CREDITS);
    d = await setPartVoice(db, d, "a", "arjun", va.id);
    d = await joinDuet(db, d, "sana", { name: "Sana", ig: "", split: false });
    d = await setPartVoice(db, d, "b", "sana", vb.id);
    d = await savePart(db, dir, d, "b", part("hum"));
    const jobs: Job[] = [];
    await startJoin(db, deps(jobs), d);
    expect(jobs[0].voices).toEqual({ splitSec: 20.2, samples: [take, take] });
  });

  it("gives voice money back on cancel", async () => {
    const db = await setup();
    const va = await voice(db, "arjun");
    let d = await savePart(db, dir, await start(db), "a", part("hum"));
    d = await setPartVoice(db, d, "a", "arjun", va.id);
    await cancelDuet(db, d);
    expect(await getBalance(db, "arjun")).toBe(20);
  });

  it("cuts the song where the first part ends and re-sings only the sides with a voice", async () => {
    const song30 = path.join(dir, "song30.mp3");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=10", "-ac", "2", song30]);
    const sung: string[] = [];
    const out = await singDuetVoices(
      { ffmpeg: defaultFfmpeg, sing: async (file) => (sung.push(path.basename(file)), file) },
      song30,
      { splitSec: 4, samples: [null, take] },
      path.join(dir, "voices-work"),
    );
    expect(sung).toEqual(["part-b.wav"]);
    expect(Math.round(await probeDuration(out))).toBe(10);
  });
});

describe("reminders and push", () => {
  it("reminds a partner who hasn't sung once, in the last 24 hours", async () => {
    const db = await setup();
    const t0 = new Date("2026-11-06T10:00:00Z");
    let d = await savePart(db, dir, await start(db), "a", part("hum"), t0);
    d = await joinDuet(db, d, "sana", { name: "Sana", ig: "", split: false }, t0);
    expect(await dueReminders(db, new Date(t0.getTime() + 10 * HOUR))).toHaveLength(0);
    expect((await dueReminders(db, new Date(t0.getTime() + 25 * HOUR))).map((x) => x.id)).toEqual([d.id]);
    expect(await dueReminders(db, new Date(t0.getTime() + 26 * HOUR))).toHaveLength(0);
  });

  it("sends to each phone and forgets ones Expo says are gone", async () => {
    const db = await setup();
    await savePushToken(db, "sana", "ExponentPushToken[aaa]");
    await savePushToken(db, "sana", "ExponentPushToken[bbb]");
    const bodies: unknown[] = [];
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(init!.body as string));
      return Response.json({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] });
    }) as unknown as typeof fetch;
    expect(await sendPush(db, ["sana", null, "sana"], { title: "Hi", body: "There", path: "/inbox" }, fetchFn)).toBe(1);
    expect((bodies[0] as { to: string; data: unknown }[]).map((m) => m.to)).toEqual(["ExponentPushToken[aaa]", "ExponentPushToken[bbb]"]);
    const left = await db.query.pushToken.findMany();
    expect(left.map((r) => r.token)).toEqual(["ExponentPushToken[aaa]"]);
  });
});
