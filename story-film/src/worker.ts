import path from "node:path";
import { Worker } from "bullmq";
import { loadEnv } from "@/lib/env";
import { runFilm } from "@/lib/pipeline/orchestrator";
import { buildPipelineDeps } from "@/lib/providers";
import { RedisQuotaStore } from "@/lib/quota/quota";
import { FILM_QUEUE, type FilmJob, getRedis } from "@/lib/queue/films";

const env = loadEnv();
const deps = buildPipelineDeps(env);

const worker = new Worker<FilmJob>(
  FILM_QUEUE,
  async (job) => {
    const workDir = path.resolve(env.OUTPUT_DIR, job.id!);
    return runFilm(deps, job.data, workDir, (stage) => job.updateProgress({ stage }));
  },
  // Each film fans out its own parallel API calls; keep films per worker low.
  { connection: getRedis(), concurrency: 2 },
);

worker.on("completed", (job) => console.log(`film ${job.id} done`));
worker.on("failed", async (job, err) => {
  console.error(`film ${job?.id} failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await new RedisQuotaStore(getRedis()).decrement(job.data.quotaKey);
  }
});
console.log(`worker listening on queue "${FILM_QUEUE}"`);
