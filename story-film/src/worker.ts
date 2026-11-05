import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Job, Worker } from "bullmq";
import { getDb } from "@/lib/db";
import { defaultFfmpeg, probeDuration } from "@/lib/ffmpeg";
import { loadEnv } from "@/lib/env";
import { updateFilm } from "@/lib/films";
import { type PipelineDeps, runFilm } from "@/lib/pipeline/orchestrator";
import { instagramAvailable, instagramClient, youtubeAvailable } from "@/lib/connect";
import { pendingPosts, publishPost } from "@/lib/posts";
import { provenanceFromEnv, trySign } from "@/lib/provenance";
import { grantCredits } from "@/lib/billing/credits";
import { creatorMessage } from "@/lib/creator-errors";
import { buildDanceSinger, buildImage, buildPipelineDeps, buildProSongEditor, buildShortSongProvider, buildSinger, buildSingDeps, buildSongEditor, buildSongProvider, buildStemSeparator, buildTranscriber, proRemixAvailable, type Quality, songsAvailable } from "@/lib/providers";
import { type MyVoiceJob, type RemixJob, SONG_QUEUE, type SongJob, type SongQueueJob, type StudioJob } from "@/lib/queue/songs";
import { SONG_STEMS_QUEUE, type StemsJob } from "@/lib/queue/song-stems";
import { mixArgs, writeStemsState } from "@/lib/songs/mix";
import { separateSongStems } from "@/lib/songs/stems";
import { singInMyVoice } from "@/lib/voice/sing";
import { makeCover } from "@/lib/songs/cover";
import { runRemix } from "@/lib/songs/remix";
import { getSongById, updateSong } from "@/lib/songs/songs";
import { type EditJob, type EditRenderJob, FILM_QUEUE, type FilmJob, type FilmQueueJob, getRedis, type MusicVideoJob } from "@/lib/queue/films";
import { onReelFinished } from "@/lib/agent/agent";
import { agentDeps } from "@/lib/agent/deps";
import { loadEditState, planEdit, renderPlannedEdit } from "@/lib/edit/pipeline";
import { runDanceReel } from "@/lib/dance/pipeline";
import { runMotionReel } from "@/lib/motion/pipeline";
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

function isEdit(job: Job<FilmQueueJob>): job is Job<EditJob> {
  return job.name === "edit";
}

function isEditRender(job: Job<FilmQueueJob>): job is Job<EditRenderJob> {
  return job.name === "edit-render";
}

function isMusicVideo(job: Job<FilmQueueJob>): job is Job<MusicVideoJob> {
  return job.name === "music-video";
}

// Job ids are film row ids (except edit re-renders, which name their film), so progress is written straight to the film.
const filmIdOf = (job: Job<FilmQueueJob>) => (isEditRender(job) ? job.data.filmId : job.id!);

const filmWorker = new Worker<FilmQueueJob>(
  FILM_QUEUE,
  async (job) => {
    const filmId = filmIdOf(job);
    const workDir = path.resolve(env.OUTPUT_DIR, filmId);
    const onStage = (stage: string) => updateFilm(db, filmId, { stage });
    await updateFilm(db, filmId, { status: "running", error: null });
    let result;
    let description: string | undefined;
    // The creator's own footage: no Content Credentials claiming it was AI-generated.
    if (isEdit(job)) {
      const state = await planEdit({ llm: depsFor("standard").llm, transcriber: buildTranscriber(env) }, job.data, workDir, onStage);
      if (job.data.review) {
        // Waits for the creator to check the effects; PUT /api/edits/[id] queues the render.
        await updateFilm(db, filmId, { status: "review", stage: null, title: state.plan.title });
        return { output: null, title: state.plan.title };
      }
      result = await renderPlannedEdit({ fontsDir: env.FONTS_DIR }, state, workDir, onStage);
    } else if (isEditRender(job)) {
      result = await renderPlannedEdit({ fontsDir: env.FONTS_DIR }, await loadEditState(workDir), workDir, onStage);
    } else if (isMusicVideo(job)) {
      const d = job.data;
      result = await runMusicVideo(
        { ...depsFor(d.quality), whisper, ...(d.singer && d.quality !== "standard" ? { singer: buildSinger(env, d.quality) } : {}) },
        { ...d, sceneSec: d.quality === "standard" ? { min: 4, max: 7 } : { min: 3, max: 5 } },
        workDir,
        onStage,
      );
      description = "AI-generated music video: song, scenes and motion made with generative AI models";
    } else if ((job.data as FilmJob).format === "dance") {
      const d = job.data as FilmJob;
      const { llm, tts } = depsFor("standard");
      const aiSong = d.danceVoice === "ai_song";
      result = await runDanceReel(
        { llm, tts, fontsDir: env.FONTS_DIR, ...(aiSong ? { singer: buildDanceSinger(env), whisper } : {}) },
        { ...d, voice: d.danceVoice, handle: d.brand?.handle },
        workDir,
        onStage,
      );
      description = aiSong
        ? "Dance reel: chant and song made with AI (ACE-Step); dancers and animation drawn by Reelkar"
        : "Dance reel: chant and voice made with AI; singing, dancers, beat and animation made by Reelkar";
    } else if ((job.data as FilmJob).format === "motion") {
      const d = job.data as FilmJob;
      const { llm, tts, music, fontsDir } = depsFor("standard");
      result = await runMotionReel({ llm, tts, music, fontsDir }, d, workDir, onStage);
      description = "Motion reel: script and voice-over made with AI; animated text and graphics rendered by Reelkar";
    } else {
      result = await runFilm(depsFor((job.data as FilmJob).quality), job.data as FilmJob, workDir, onStage);
      description = "AI-generated video: script, images, motion and narration made with generative AI models";
    }
    const contentCredentials = description ? await trySign(provenance, result.output, { title: result.title, description }) : false;
    await updateFilm(db, filmId, {
      status: "completed",
      title: result.title,
      outputPath: result.output,
      contentCredentials,
      completedAt: new Date(),
    });
    // Posts Ask Reelkar promised for this reel go out now.
    await onReelFinished(agentDeps(), filmId).catch((err) => console.error(`agent posts for ${filmId} failed:`, err));
    return result;
  },
  // Each film fans out its own parallel API calls; keep films per worker low.
  { connection: getRedis(), concurrency: 2 },
);

filmWorker.on("completed", (job) => console.log(`film ${job.id} done`));
filmWorker.on("failed", async (job, err) => {
  console.error(`film ${job?.id} failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    // A failed re-render keeps the video the creator already has.
    if (isEditRender(job) && job.data.rerender) {
      await updateFilm(db, job.data.filmId, { status: "completed", stage: "done", error: `Re-render failed: ${creatorMessage(err)}`.slice(0, 500) });
      return;
    }
    // The raw provider error stays in the log above; the creator gets a plain sentence.
    await updateFilm(db, filmIdOf(job), { status: "failed", error: creatorMessage(err) });
    await onReelFinished(agentDeps(), filmIdOf(job)).catch(() => undefined);
    if ("quotaKey" in job.data && job.data.quotaKey) await new RedisQuotaStore(getRedis()).decrement(job.data.quotaKey);
    if (job.data.credits > 0) await grantCredits(db, job.data.userId, job.data.credits, "refund", job.id!);
  }
});

// Songs run only when fal.ai is configured.
if (songsAvailable(env)) {
  const singer = buildSongProvider(env);
  const singDeps = buildSingDeps(env);
  const songEditor = buildSongEditor(env);
  const proSongEditor = proRemixAvailable(env) ? buildProSongEditor(env) : undefined;
  const shortSinger = buildShortSongProvider(env);
  // Cover art uses the free Cloudflare images; without them songs simply have no cover.
  const coverImage = env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN ? buildImage(env) : null;
  const songWorker = new Worker<SongQueueJob>(
    SONG_QUEUE,
    async (job) => {
      const { songId } = job.data;
      await updateSong(db, songId, { status: "running", error: null });
      const dir = path.resolve(env.OUTPUT_DIR, "songs");
      await mkdir(dir, { recursive: true });
      let outputPath: string;
      if (job.name === "my-voice") {
        const d = job.data as MyVoiceJob;
        const mixed = await singInMyVoice(singDeps, d.parentSongFile, d.sampleFile, path.join(dir, `${songId}-work`));
        outputPath = path.join(dir, `${songId}.mp3`);
        await rename(mixed, outputPath);
        await rm(path.join(dir, `${songId}-work`), { recursive: true, force: true });
      } else if (job.name === "studio") {
        outputPath = path.join(dir, `${songId}.mp3`);
        await defaultFfmpeg(mixArgs({ ...(job.data as StudioJob).mix, output: outputPath }));
        await updateSong(db, songId, { durationSec: Math.round(await probeDuration(outputPath)) });
      } else if (job.name === "remix") {
        const audio = await runRemix(songEditor, (job.data as RemixJob).call, { workDir: dir, ffmpeg: defaultFfmpeg, probeDuration, pro: proSongEditor, separator: singDeps.separator });
        outputPath = path.join(dir, `${songId}.${audio.ext}`);
        await writeFile(outputPath, audio.data);
      } else {
        const d = job.data as SongJob;
        const audio = await (d.model === "lyria" ? shortSinger : singer).sing(d);
        outputPath = path.join(dir, `${songId}.${audio.ext}`);
        await writeFile(outputPath, audio.data);
      }
      const contentCredentials = await trySign(provenance, outputPath, {
        title: job.data.title,
        description:
          job.name === "my-voice"
            ? "AI-generated song, re-sung with AI voice conversion in the account holder's own consented voice"
            : job.name === "remix"
              ? "AI-generated song, remixed with generative AI (ACE-Step)"
              : job.name === "studio"
                ? "AI-generated song, remixed with audio effects (AI stem separation with Demucs)"
              : "AI-generated song: lyrics, music and vocals made with generative AI models",
      });
      await updateSong(db, songId, { status: "completed", outputPath, contentCredentials, completedAt: new Date() });
      // Cover art comes after the song is playable, and a failed picture never fails the song.
      const made = coverImage ? await getSongById(db, songId) : undefined;
      const coverPath = made
        ? await makeCover({ image: coverImage!, ffmpeg: defaultFfmpeg }, made, path.join(dir, `${songId}-cover.jpg`)).catch((err) => {
            console.error(`song ${songId} cover failed:`, (err as Error).message);
            return null;
          })
        : null;
      if (coverPath) await updateSong(db, songId, { coverPath });
    },
    { connection: getRedis(), concurrency: 2 },
  );
  songWorker.on("failed", async (job, err) => {
    console.error(`song ${job?.data.songId} failed:`, err.message);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await updateSong(db, job.data.songId, { status: "failed", error: creatorMessage(err) });
      await grantCredits(db, job.data.userId, job.data.credits, "refund", `song:${job.data.songId}`);
    }
  });
  console.log(`song worker listening on queue "${SONG_QUEUE}"`);

  // The Studio's stems, made once per song on demand and saved next to it.
  const stemSeparator = buildStemSeparator(env);
  const stemsWorker = new Worker<StemsJob>(
    SONG_STEMS_QUEUE,
    async (job) => separateSongStems(stemSeparator, job.data.songFile, job.data.dir, { ffmpeg: defaultFfmpeg }),
    { connection: getRedis(), concurrency: 2 },
  );
  stemsWorker.on("failed", async (job, err) => {
    console.error(`stems for song ${job?.data.songId} failed:`, err.message);
    if (!job) return;
    await writeStemsState(job.data.dir, { status: "failed", error: creatorMessage(err) });
    if (job.data.credits > 0) await grantCredits(db, job.data.userId, job.data.credits, "refund", job.data.ref);
  });
}

// Publishing runs when YouTube and/or Instagram is configured.
if (youtubeAvailable(env) || instagramAvailable(env)) {
  const publishDeps = {
    db,
    tokenKey: tokenKey(env),
    youtube: youtubeAvailable(env) ? youtubeClient(env) : undefined,
    instagram: instagramAvailable(env) ? instagramClient(env) : undefined,
    baseUrl: env.BETTER_AUTH_URL,
  };
  const publishWorker = new Worker<PublishJob>(PUBLISH_QUEUE, (job) => publishPost(publishDeps, job.data.postId), {
    connection: getRedis(),
    concurrency: 2,
    // Instagram processing is polled inside the job for up to ~5 minutes.
    lockDuration: 10 * 60_000,
  });
  publishWorker.on("failed", (job, err) => console.error(`post ${job?.data.postId} failed:`, err.message));
  // Re-queue anything scheduled (no-op for posts that already have a job).
  const queue = getPublishQueue();
  for (const post of await pendingPosts(db)) await enqueuePost(queue, post);
  console.log(`publisher listening on queue "${PUBLISH_QUEUE}"`);
} else {
  console.log("publisher disabled: set TOKEN_ENCRYPTION_KEY plus Google (YouTube) and/or Instagram app keys");
}

console.log(`worker listening on queue "${FILM_QUEUE}"`);
