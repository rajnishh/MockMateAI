import { Queue } from "bullmq";
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

export type SongQueueJob = SongJob | MyVoiceJob;

let queue: Queue<SongQueueJob> | undefined;

export function getSongQueue(): Queue<SongQueueJob> {
  queue ??= new Queue<SongQueueJob>(SONG_QUEUE, { connection: getRedis() });
  return queue;
}
