import path from "node:path";
import { Worker } from "bullmq";
import { getDb } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { updateFilm } from "@/lib/films";
import { runFilm } from "@/lib/pipeline/orchestrator";
import { buildPipelineDeps } from "@/lib/providers";
import { FILM_QUEUE, type FilmJob, getRedis } from "@/lib/queue/films";
import { RedisQuotaStore } from "@/lib/quota/quota";

const env = loadEnv();
const deps = buildPipelineDeps(env);
const db = getDb();

// Job ids are film row ids, so progress is written straight to the film.
const worker = new Worker<FilmJob>(
  FILM_QUEUE,
  async (job) => {
    const filmId = job.id!;
    await updateFilm(db, filmId, { status: "running", error: null });
    const result = await runFilm(deps, job.data, path.resolve(env.OUTPUT_DIR, filmId), (stage) =>
      updateFilm(db, filmId, { stage }),
    );
    await updateFilm(db, filmId, { status: "completed", title: result.title, outputPath: result.output, completedAt: new Date() });
    return result;
  },
  // Each film fans out its own parallel API calls; keep films per worker low.
  { connection: getRedis(), concurrency: 2 },
);

worker.on("completed", (job) => console.log(`film ${job.id} done`));
worker.on("failed", async (job, err) => {
  console.error(`film ${job?.id} failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await updateFilm(db, job.id!, { status: "failed", error: err.message.slice(0, 500) });
    await new RedisQuotaStore(getRedis()).decrement(job.data.quotaKey);
  }
});
console.log(`worker listening on queue "${FILM_QUEUE}"`);
