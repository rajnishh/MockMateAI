import { llmForUser } from "@/lib/ai/engines";
import type { Db } from "@/lib/db";
import type { MakeDeps } from "@/lib/duets";
import type { Env } from "@/lib/env";
import { defaultFfmpeg } from "@/lib/ffmpeg";
import { getSongQueue } from "@/lib/queue/songs";
import { type SongLanguage, writeLyrics } from "@/lib/songs/lyrics";
import { findGenre } from "@/lib/songs/styles";
import { tuneSongCall } from "@/lib/voice-create/hum-song";

// The real ffmpeg, lyrics writer and song queue behind a Jugalbandi's song (tests pass their own).
export async function duetMakeDeps(db: Db, env: Env, starterId: string, genreId: string, language: string): Promise<MakeDeps> {
  const genre = findGenre(genreId) ?? findGenre("pop")!;
  const llm = await llmForUser(db, env, starterId);
  return {
    outputDir: env.OUTPUT_DIR,
    ffmpeg: defaultFfmpeg,
    writeLyrics: async (topic, durationSec) => (await writeLyrics(llm, { topic, genre, mood: "", language: language as SongLanguage, durationSec })).lyrics,
    tuneCall: (input) => tuneSongCall({ ...input, genre, mood: "", language: language as SongLanguage }),
    queue: async (job) => {
      await getSongQueue().add("remix", { ...job, duet: true }, { jobId: job.songId });
    },
  };
}
