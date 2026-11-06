import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { creatorProfile, song, user } from "@/lib/db/schema";
import { newGiftToken } from "@/lib/gifts";
import { getProfile, suggestHandles } from "@/lib/listen";

// Five finished songs that fill an account and Listen while there are few real ones.
// `file` is the audio's name in the samples folder; a `<name>-cover.jpg` beside it is the cover.
export const SAMPLE_SONGS = [
  { file: "sample1", title: "Dhol di awaaz", genre: "bhangra", mood: "energetic", language: "pa", durationSec: 117, lyrics: "[Verse]\nਢੋਲ ਵੱਜਦਾ ਪਿੰਡ ਵਿੱਚ\n\n[Chorus]\nਨੱਚੋ ਸਾਰੇ ਰਲ ਕੇ" },
  { file: "sample2", title: "Gali gali mein", genre: "punjabi-pop", mood: "happy", language: "hi", durationSec: 60, lyrics: "[Verse]\nGali gali mein shor hai\n\n[Chorus]\nAaj ki raat hamari" },
  { file: "sample3", title: "Ya layl", genre: "khaleeji", mood: "romantic", language: "ar", durationSec: 60, lyrics: "[Verse]\nيا ليل طوّل\n\n[Chorus]\nقلبي معاك" },
  { file: "sample4", title: "Chai aur baarish", genre: "lofi-hindi", mood: "peaceful", language: "hi", durationSec: 60, lyrics: "[Verse]\nBaarish ki boondein\n\n[Chorus]\nChai ki pyaali" },
  { file: "sample5", title: "Mann ki baat", genre: "bhangra", mood: "energetic", language: "hi", durationSec: 60, lyrics: "[Verse]\nDil ki dhadkan\n\n[Chorus]\nBalle balle" },
] as const;

export type SampleResult = { phone: string; added: number; handle: string } | { phone: string; error: string };

// Adds the sample songs, published on Listen, to the account behind each phone number.
// Running it again adds nothing new. An account without a handle gets one it can change
// straight away (the change cooldown is set as already passed).
export async function addSampleSongs(db: Db, phones: string[], samplesDir: string, now = new Date()): Promise<SampleResult[]> {
  const out: SampleResult[] = [];
  for (const phone of phones) {
    const [u] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.phoneNumber, phone));
    if (!u) {
      out.push({ phone, error: "No account yet. Sign in with this number once, then run this again." });
      continue;
    }
    let profile = await getProfile(db, u.id);
    if (!profile) {
      const [handle] = await suggestHandles(db, u.name);
      await db.insert(creatorProfile).values({ userId: u.id, handle, handleChangedAt: new Date(0) });
      profile = await getProfile(db, u.id);
    }
    const paths = SAMPLE_SONGS.map((s) => `${samplesDir}/${s.file}.mp3`);
    const have = new Set(
      (await db.select({ p: song.outputPath }).from(song).where(and(eq(song.userId, u.id), inArray(song.outputPath, paths)))).map((r) => r.p),
    );
    let added = 0;
    for (const [i, s] of SAMPLE_SONGS.entries()) {
      if (have.has(paths[i])) continue;
      // Spread over the last few days, so New and Trending look lived in.
      const at = new Date(now.getTime() - (i + 1) * 7 * 3600_000);
      await db.insert(song).values({
        userId: u.id,
        title: s.title,
        genre: s.genre,
        mood: s.mood,
        language: s.language,
        lyrics: s.lyrics,
        durationSec: s.durationSec,
        credits: 0,
        status: "completed",
        outputPath: paths[i],
        coverPath: `${samplesDir}/${s.file}-cover.jpg`,
        createdAt: at,
        completedAt: at,
        publicId: newGiftToken(),
        publishedAt: at,
        showLyrics: true,
        allowRemix: true,
      });
      added++;
    }
    out.push({ phone, added, handle: profile!.handle });
  }
  return out;
}
