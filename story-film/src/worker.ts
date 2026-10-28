import path from "node:path";
import { Worker } from "bullmq";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { updateFilm } from "@/lib/films";
import { type PipelineDeps, runFilm } from "@/lib/pipeline/orchestrator";
import { pendingPosts, publishPost } from "@/lib/posts";
import { grantCredits } from "@/lib/billing/credits";
import { buildPipelineDeps, type Quality } from "@/lib/providers";
import { FILM_QUEUE, type FilmJob, getRedis } from "@/lib/queue/films";
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

// Job ids are film row ids, so progress is written straight to the film.
const filmWorker = new Worker<FilmJob>(
  FILM_QUEUE,
  async (job) => {
    const filmId = job.id!;
    await updateFilm(db, filmId, { status: "running", error: null });
    const result = await runFilm(depsFor(job.data.quality), job.data, path.resolve(env.OUTPUT_DIR, filmId), (stage) =>
      updateFilm(db, filmId, { stage }),
    );
    await updateFilm(db, filmId, { status: "completed", title: result.title, outputPath: result.output, completedAt: new Date() });
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
    if (job.data.quotaKey) await new RedisQuotaStore(getRedis()).decrement(job.data.quotaKey);
    if (job.data.credits > 0) await grantCredits(db, job.data.userId, job.data.credits, "refund", job.id!);
  }
});

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
