import { readFile, rm, writeFile } from "node:fs/promises";
import { llmForUser } from "@/lib/ai/engines";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { SONG_CREDITS, STANDARD_CREDITS, TUNE_SONG_CREDITS } from "@/lib/billing/catalog";
import { loadEnv } from "@/lib/env";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { normaliseLanguage } from "@/lib/languages";
import { buildTranscriber, editsAvailable, songsAvailable } from "@/lib/providers";
import type { TimedWord } from "@/lib/providers/whisper";
import { getRedis } from "@/lib/queue/films";
import { allow } from "@/lib/rate-limit";
import { getUserId, unauthorized } from "@/lib/session";
import { meaningfulWords, understand } from "@/lib/voice-create/heard";
import {
  UPLOAD_AUDIO_TYPES,
  extractArgs,
  MAX_TAKE_BYTES,
  newTakeId,
  removeTakeFiles,
  saveTakeMeta,
  sweepOldTakes,
  TAKE_SEC,
  takeFiles,
  UPLOAD_VIDEO_TYPES,
} from "@/lib/voice-create/takes";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// "Hum it": upload one recording (or a filmed / imported clip). Reelkar works out whether it was a hum,
// a sung tune or a spoken request, and sends back a plan for the creator to check. Nothing is charged here.
// The phone may send what it understood on its own (on-device speech recognition) as `transcript`;
// Whisper on the server is used when it didn't, or heard too little to be sure.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const env = loadEnv();
  if (!(await allow(getRedis(), `ratelimit:voice-take:${userId}`, 80, 24 * 3600))) return bad("You've recorded a lot today. Try again tomorrow.", 429);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return bad("Record something first.");
  if (file.size > MAX_TAKE_BYTES) return bad("That file is too large (150 MB max).");
  const type = file.type.toLowerCase();
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  const videoExt = UPLOAD_VIDEO_TYPES[type] ?? (Object.values(UPLOAD_VIDEO_TYPES).includes(fromName) ? fromName : undefined);
  const audioExt = UPLOAD_AUDIO_TYPES[type] ?? (Object.values(UPLOAD_AUDIO_TYPES).includes(fromName) ? fromName : undefined);
  const ext = videoExt ?? audioExt;
  if (!ext) return bad("Use an audio recording or a video (M4A, MP3, WAV, MP4 or MOV).");

  const takeId = newTakeId();
  const files = takeFiles(env.OUTPUT_DIR, userId, takeId);
  await sweepOldTakes(files.dir);
  await saveTakeMeta(files, { id: takeId, kind: "hum", transcript: "", durationSec: 0, videoFile: null, createdAt: new Date().toISOString() });
  const original = files.original(ext);
  await writeFile(original, Buffer.from(await file.arrayBuffer()));
  const fail = async (message: string, status = 400) => {
    await removeTakeFiles(files, ext);
    return bad(message, status);
  };

  try {
    await defaultFfmpeg(extractArgs(original, files.mp3, files.wav16k));
  } catch {
    return fail(videoExt ? "We couldn't hear anything in that video. Does it have sound?" : "We couldn't read that recording. Try again.");
  }
  const durationSec = await probeDuration(files.mp3).catch(() => NaN);
  if (!Number.isFinite(durationSec) || durationSec < TAKE_SEC.min) return fail("That was very short. Hum, sing or talk for a few seconds.");

  const language = normaliseLanguage(form.get("language"));
  let transcript = String(form.get("transcript") ?? "").slice(0, 3000);
  let words: TimedWord[] = [];
  // Phones are good at speech and bad at singing, so the server listens again unless the phone heard plenty.
  if (meaningfulWords(transcript).length < 6 && editsAvailable(env)) {
    try {
      const heard = await buildTranscriber(env).transcribe(await readFile(files.wav16k), language === "auto" ? undefined : language);
      if (meaningfulWords(heard.text).length >= meaningfulWords(transcript).length) {
        transcript = heard.text;
        words = heard.words;
      }
    } catch (err) {
      console.warn(`Whisper failed on a voice take: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  let llm;
  try {
    llm = await llmForUser(getDb(), env, userId);
  } catch {
    llm = undefined;
  }
  const heard = await understand(llm, { transcript, words, durationSec });
  await saveTakeMeta(files, {
    id: takeId,
    kind: heard.kind,
    transcript: heard.transcript,
    durationSec,
    videoFile: videoExt ? original : null,
    createdAt: new Date().toISOString(),
  });
  if (!videoExt) await rm(original, { force: true });

  return NextResponse.json(
    {
      takeId,
      durationSec,
      video: Boolean(videoExt),
      ...heard,
      // What each choice on the confirmation card costs. A reel uses the free weekly allowance first.
      credits: { tune: TUNE_SONG_CREDITS, song: SONG_CREDITS, reel: STANDARD_CREDITS },
      songsAvailable: songsAvailable(env),
    },
    { status: 201 },
  );
}
