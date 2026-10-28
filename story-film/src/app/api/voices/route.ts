import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { buildWhisper, myVoiceAvailable } from "@/lib/providers";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { consentStatement, newConsentCode, SAMPLE_MAX_SEC, SAMPLE_MIN_SEC, transcriptHasCode } from "@/lib/voice/consent";
import { listVoices, MAX_VOICES, saveVoice, voiceView } from "@/lib/voice/profiles";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const codeKey = (userId: string) => `voice-consent:${userId}`;

// One code per user, valid for 15 minutes and usable once.
async function consentCode(userId: string): Promise<string> {
  const redis = getRedis();
  const existing = await redis.get(codeKey(userId));
  if (existing) return existing;
  const code = newConsentCode();
  await redis.set(codeKey(userId), code, "EX", 15 * 60);
  return code;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const code = await consentCode(userId);
  return NextResponse.json({
    available: myVoiceAvailable(loadEnv()),
    voices: (await listVoices(getDb(), userId)).map(voiceView),
    consent: { code, statement: consentStatement(code) },
    limits: { minSec: SAMPLE_MIN_SEC, maxSec: SAMPLE_MAX_SEC, maxVoices: MAX_VOICES },
  });
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!myVoiceAvailable(env)) return bad("Voice features aren't set up yet", 503);
  if (!(await allow(getRedis(), `ratelimit:voice:${userId}`, 10, 24 * 3600))) return bad("Too many attempts today. Try again tomorrow.", 429);

  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim().slice(0, 40) || "My voice";
  const audio = form.get("audio");
  if (form.get("consent") !== "yes") return bad("Please confirm this is your own voice and that you agree.");
  if (!(audio instanceof File) || audio.size === 0) return bad("Please record or upload your voice.");
  if (audio.size > MAX_UPLOAD_BYTES) return bad("That recording is too large (15 MB max).");

  const db = getDb();
  if ((await listVoices(db, userId)).length >= MAX_VOICES) return bad(`You can keep up to ${MAX_VOICES} voices. Delete one first.`);
  const code = await getRedis().get(codeKey(userId));
  if (!code) return bad("Your consent code expired. Reload the page and record again.");

  const dir = path.resolve(env.OUTPUT_DIR, "voices");
  await mkdir(dir, { recursive: true });
  const id = randomUUID();
  const raw = path.join(dir, `${id}.upload`);
  const sample = path.join(dir, `${id}.wav`);
  await writeFile(raw, Buffer.from(await audio.arrayBuffer()));
  try {
    // Normalise whatever the browser recorded (webm/ogg/m4a) to WAV.
    await defaultFfmpeg(["-y", "-loglevel", "error", "-i", raw, "-ac", "1", "-ar", "24000", sample]);
  } catch {
    await rm(raw, { force: true });
    return bad("Couldn't read that audio file.");
  }
  await rm(raw, { force: true });

  const duration = await probeDuration(sample);
  if (duration < SAMPLE_MIN_SEC || duration > SAMPLE_MAX_SEC + 1) {
    await rm(sample, { force: true });
    return bad(`Please record between ${SAMPLE_MIN_SEC} and ${SAMPLE_MAX_SEC} seconds.`);
  }

  let transcript: string;
  try {
    transcript = await buildWhisper(env).transcribe(await readFile(sample));
  } catch {
    await rm(sample, { force: true });
    return bad("Couldn't check the recording right now. Please try again.", 502);
  }
  if (!transcriptHasCode(transcript, code)) {
    await rm(sample, { force: true });
    return bad("We couldn't hear your code in the recording. Read the whole statement, including the 4-digit code, clearly.");
  }

  const voice = await saveVoice(db, {
    id,
    userId,
    name,
    samplePath: sample,
    durationSec: Math.round(duration),
    consentText: consentStatement(code),
    consentCode: code,
    transcript: transcript.slice(0, 2000),
    consentIp: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
    consentUserAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  await getRedis().del(codeKey(userId));
  return NextResponse.json({ voice: voiceView(voice) }, { status: 201 });
}
