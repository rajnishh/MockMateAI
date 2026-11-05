import { readMedia } from "@/lib/media";
import { AUDIO_TYPES, audioExt, type SongAudio, type SongInput } from "./fal-music";
import type { CoverInput, ReplaceSectionInput } from "./fal-song-edit";
import type { MusicProvider } from "./types";

// A self-hosted ACE-Step 1.5 server (`uv run acestep-api`, or start_api_server_macos.sh on a Mac), free
// to run. Its REST API (docs/en/API.md in ACE-Step-1.5, checked 2026-11-05) is asynchronous: POST
// /release_task gives a task_id, POST /query_result reports status 0 (running), 1 (done) or 2 (failed),
// and the result's `file` is a /v1/audio?path=… link to download.
const POLL_MS = 3000;
// A Mac takes minutes for a full song; give up after 30.
const TIMEOUT_MS = 30 * 60_000;

interface Envelope<T> {
  data: T;
  code: number;
  error: string | null;
}

interface TaskResult {
  task_id: string;
  status: number;
  result?: string;
}

export class AceStepMusic implements MusicProvider {
  readonly modelId = "ace-step-1.5-local";

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly pollMs = POLL_MS,
  ) {}

  // Background music for videos.
  async compose(input: { prompt: string; durationSec: number }): Promise<Buffer> {
    return (await this.generate({ prompt: input.prompt.slice(0, 512), lyrics: "[Instrumental]", audio_duration: input.durationSec })).data;
  }

  // A song with vocals: Song Studio and dance reels' AI singing.
  sing(input: SongInput): Promise<SongAudio> {
    return this.generate({
      prompt: input.style.slice(0, 512),
      lyrics: input.lyrics,
      audio_duration: input.durationSec,
      ...(input.vocalLanguage !== "unknown" ? { vocal_language: input.vocalLanguage } : {}),
      thinking: true,
    });
  }

  // Remix: restyle a song.
  async cover(input: CoverInput): Promise<SongAudio> {
    return this.generate({ task_type: "cover", prompt: input.style.slice(0, 512), lyrics: input.lyrics ?? input.originalLyrics }, input.audioUrl);
  }

  // Remix: redo one part of a song.
  async replaceSection(input: ReplaceSectionInput): Promise<SongAudio> {
    return this.generate(
      {
        task_type: "repaint",
        prompt: input.style.slice(0, 512),
        ...(input.lyrics !== undefined ? { lyrics: input.lyrics } : {}),
        repainting_start: input.startSec,
        repainting_end: input.endSec,
        chunk_mask_mode: "explicit",
      },
      input.audioUrl,
    );
  }

  private async generate(params: Record<string, unknown>, srcAudioUrl?: string): Promise<SongAudio> {
    const fields = { ...params, batch_size: 1, audio_format: "mp3" };
    let body: BodyInit;
    let headers: Record<string, string> = {};
    if (srcAudioUrl) {
      // The server reads source audio from an upload; files on this computer are sent as they are.
      const data = await readMedia(srcAudioUrl, this.fetchFn);
      const ext = audioExt(data, "mp3");
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
      form.append("src_audio", new Blob([new Uint8Array(data)], { type: AUDIO_TYPES[ext] }), `song.${ext}`);
      body = form;
    } else {
      body = JSON.stringify(fields);
      headers = { "Content-Type": "application/json" };
    }
    const { task_id } = await this.call<{ task_id: string }>("/release_task", { method: "POST", headers, body });

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      const [task] = await this.call<TaskResult[]>("/query_result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id_list: [task_id] }),
      });
      if (task?.status === 2) throw new Error(`ACE-Step failed: ${task.result ?? "no reason given"}`.slice(0, 500));
      if (task?.status === 1) {
        const file = (JSON.parse(task.result ?? "[]") as { file?: string }[])[0]?.file;
        if (!file) throw new Error("ACE-Step finished without an audio file");
        const res = await this.fetchFn(new URL(file, this.baseUrl));
        if (!res.ok) throw new Error(`ACE-Step download ${res.status}`);
        const data = Buffer.from(await res.arrayBuffer());
        return { data, ext: audioExt(data, "mp3") };
      }
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
    throw new Error("ACE-Step took too long");
  }

  private async call<T>(route: string, init: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${route}`, init);
    if (!res.ok) throw new Error(`ACE-Step ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const out = (await res.json()) as Envelope<T>;
    if (out.code !== 200 || out.error) throw new Error(`ACE-Step: ${out.error ?? out.code}`);
    return out.data;
  }
}
