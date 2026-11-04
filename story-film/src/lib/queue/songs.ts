import { Queue } from "bullmq";
import type { RemixCall } from "@/lib/songs/remix";
import type { SongModel } from "@/lib/songs/request";
import { getRedis } from "./films";

export const SONG_QUEUE = "songs";

export interface SongJob {
  songId: string;
  userId: string;
  title: string;
  style: string;
  lyrics: string;
  durationSec: number;
  vocalLanguage: string;
  credits: number;
  // Missing on jobs queued before short songs existed: ACE-Step.
  model?: SongModel;
}

// Job name "my-voice": re-sing an existing song in the user's recorded voice.
export interface MyVoiceJob {
  songId: string;
  userId: string;
  title: string;
  parentSongFile: string;
  sampleFile: string;
  credits: number;
}

// Job name "remix": a cover, an extension or a replaced part of an existing song.
export interface RemixJob {
  songId: string;
  userId: string;
  title: string;
  // Built by the API route; its audioUrl is the original song's file:// URL.
  call: RemixCall;
  credits: number;
}

export type SongQueueJob = SongJob | MyVoiceJob | RemixJob;

let queue: Queue<SongQueueJob> | undefined;

export function getSongQueue(): Queue<SongQueueJob> {
  queue ??= new Queue<SongQueueJob>(SONG_QUEUE, { connection: getRedis() });
  return queue;
}
