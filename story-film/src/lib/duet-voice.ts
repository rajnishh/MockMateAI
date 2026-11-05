import { mkdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { duet } from "@/lib/db/schema";
import { dueReminders, type DuetVoices } from "@/lib/duets";
import { notify } from "@/lib/push";

// Cuts the joined duet where the first part ends, re-sings each side that has a voice in its own
// singer's voice, and joins them again. sing() is "my voice" (lib/voice/sing.ts) for one file.
export async function singDuetVoices(
  deps: { ffmpeg: (args: string[]) => Promise<void>; sing: (songFile: string, sampleFile: string, workDir: string) => Promise<string> },
  songFile: string,
  voices: DuetVoices,
  workDir: string,
): Promise<string> {
  await mkdir(workDir, { recursive: true });
  const halves = [path.join(workDir, "part-a.wav"), path.join(workDir, "part-b.wav")];
  await deps.ffmpeg(["-y", "-loglevel", "error", "-i", songFile, "-t", String(voices.splitSec), "-ac", "2", "-ar", "44100", halves[0]]);
  await deps.ffmpeg(["-y", "-loglevel", "error", "-ss", String(voices.splitSec), "-i", songFile, "-ac", "2", "-ar", "44100", halves[1]]);
  const sung = await Promise.all(halves.map((file, i) => (voices.samples[i] ? deps.sing(file, voices.samples[i]!, path.join(workDir, `voice-${i}`)) : file)));
  const out = path.join(workDir, "duet-voices.mp3");
  await deps.ffmpeg(["-y", "-loglevel", "error", "-i", sung[0], "-i", sung[1], "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]", "-map", "[out]", "-ac", "2", "-ar", "44100", "-b:a", "192k", out]);
  return out;
}

// After a duet's song is made: tell both people it's ready to hear and approve.
export async function duetSongDone(db: Db, songId: string): Promise<void> {
  const [d] = await db.select().from(duet).where(eq(duet.songId, songId));
  if (d && d.status === "joining") notify(db, [d.starterId, d.partnerId], { title: "Your Jugalbandi is ready", body: `“${d.topic}” · listen and approve`, path: `/duets/${d.id}` });
}

// The 24-hour reminder, run by the worker every 15 minutes.
export async function sendDuetReminders(db: Db, now = new Date()): Promise<number> {
  const due = await dueReminders(db, now);
  for (const d of due) {
    notify(db, [d.partnerId ?? d.invitedUserId], { title: `${d.starterName}'s Jugalbandi closes tomorrow`, body: `“${d.topic}” · sing your part`, path: `/duets/${d.id}` });
  }
  return due.length;
}
