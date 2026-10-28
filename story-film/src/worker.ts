import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Job, Worker } from "bullmq";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { updateFilm } from "@/lib/films";
import { type PipelineDeps, runFilm } from "@/lib/pipeline/orchestrator";
import { pendingPosts, publishPost } from "@/lib/posts";
import { provenanceFromEnv, trySign } from "@/lib/provenance";
import { grantCredits } from "@/lib/billing/credits";
import { buildPipelineDeps, buildSongProvider, type Quality, songsAvailable } from "@/lib/providers";
import { SONG_QUEUE, type SongJob } from "@/lib/queue/songs";
import { updateSong } from "@/lib/songs/songs";
import { FILM_QUEUE, type FilmJob, type FilmQueueJob, getRedis, type MusicVideoJob } from "@/lib/queue/films";
import { runMusicVideo } from "@/lib/music-video/pipeline";
import { CloudflareWhisper } from "@/lib/providers/whisper";
import { enqueuePost, getPublishQueue, PUBLISH_QUEUE, type PublishJob } from "@/lib/queue/publish";
import { RedisQuotaStore } from "@/lib/quota/quota";
import { tokenKey, youtubeClient } from "@/lib/youtube-config";

const env = loadEnv();
// Built on first use so a server without fal.ai keys still runs standard videos.
const depsByQuality = new Map<Quality, PipelineDeps>();
function depsFor(quality: Quality): PipelineDeps {
  if (!depsByQuality.has(quality)) depsByQuality.set(quality, { ...buildPipelineDeps(env, quality), fontsDir: env.FONTS_DIR });
  return depsByQuality.get(quality)!;
}
const db = getDb();
const provenance = provenanceFromEnv(env);
if (!provenance) console.log("C2PA Content Credentials disabled: set C2PA_CERT_CHAIN and C2PA_PRIVATE_KEY");

const whisper =
  env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN ? new CloudflareWhisper(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN) : undefined;

function isMusicVideo(job: Job<FilmQueueJob>): job is Job<MusicVideoJob> {
  return job.name === "music-video";
}

// Job ids are film row ids, so progress is written straight to the film.
const filmWorker = new Worker<FilmQueueJob>(
  FILM_QUEUE,
  async (job) => {
    const filmId = job.id!;
    const workDir = path.resolve(env.OUTPUT_DIR, filmId);
    const onStage = (stage: string) => updateFilm(db, filmId, { stage });
    await updateFilm(db, filmId, { status: "running", error: null });
    let result;
    let description;
    if (isMusicVideo(job)) {
      const d = job.data;
      result = await runMusicVideo(
        { ...depsFor(d.quality), whisper },
        { ...d, sceneSec: d.quality === "premium" ? { min: 3, max: 5 } : { min: 4, max: 7 } },
        workDir,
        onStage,
      );
      description = "AI-generated music video: song, scenes and motion made with generative AI models";
    } else {
      result = await runFilm(depsFor(job.data.quality), job.data as FilmJob, workDir, onStage);
      description = "AI-generated video: script, images, motion and narration made with generative AI models";
    }
    const contentCredentials = await trySign(provenance, result.output, { title: result.title, description });
    await updateFilm(db, filmId, {
      status: "completed",
      title: result.title,
      outputPath: result.output,
      contentCredentials,
      completedAt: new Date(),
    });
    return result;
  },
  // Each film fans out its own parallel API calls; keep films per worker low.
  { connection: getRedis(), concurrency: 2 },
);

filmWorker.on("completed", (job) => console.log(`film ${job.id} done`));
filmWorker.on("failed", async (job, err) => {
  console.error(`film ${job?.id} failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await updateFilm(db, job.id!, { status: "failed", error: err.message.slice(0, 500) });
    if ("quotaKey" in job.data && job.data.quotaKey) await new RedisQuotaStore(getRedis()).decrement(job.data.quotaKey);
    if (job.data.credits > 0) await grantCredits(db, job.data.userId, job.data.credits, "refund", job.id!);
  }
});

// Songs run only when fal.ai is configured.
if (songsAvailable(env)) {
  const singer = buildSongProvider(env);
  const songWorker = new Worker<SongJob>(
    SONG_QUEUE,
    async (job) => {
      const { songId } = job.data;
      await updateSong(db, songId, { status: "running", error: null });
      const audio = await singer.sing(job.data);
      const dir = path.resolve(env.OUTPUT_DIR, "songs");
      await mkdir(dir, { recursive: true });
      const outputPath = path.join(dir, `${songId}.${audio.ext}`);
      await writeFile(outputPath, audio.data);
      const contentCredentials = await trySign(provenance, outputPath, {
        title: job.data.title,
        description: "AI-generated song: lyrics, music and vocals made with generative AI models",
      });
      await updateSong(db, songId, { status: "completed", outputPath, contentCredentials, completedAt: new Date() });
    },
    { connection: getRedis(), concurrency: 2 },
  );
  songWorker.on("failed", async (job, err) => {
    console.error(`song ${job?.data.songId} failed:`, err.message);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await updateSong(db, job.data.songId, { status: "failed", error: err.message.slice(0, 500) });
      await grantCredits(db, job.data.userId, job.data.credits, "refund", `song:${job.data.songId}`);
    }
  });
  console.log(`song worker listening on queue "${SONG_QUEUE}"`);
}

// Publishing runs only when YouTube is configured.
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY) {
  const publishDeps = { db, tokenKey: tokenKey(env), youtube: youtubeClient(env) };
  const publishWorker = new Worker<PublishJob>(PUBLISH_QUEUE, (job) => publishPost(publishDeps, job.data.postId), {
    connection: getRedis(),
    concurrency: 2,
  });
  publishWorker.on("failed", (job, err) => console.error(`post ${job?.data.postId} failed:`, err.message));
  // Re-queue anything scheduled (no-op for posts that already have a job).
  const queue = getPublishQueue();
  for (const post of await pendingPosts(db)) await enqueuePost(queue, post);
  console.log(`publisher listening on queue "${PUBLISH_QUEUE}"`);
} else {
  console.log("publisher disabled: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY");
}

console.log(`worker listening on queue "${FILM_QUEUE}"`);
