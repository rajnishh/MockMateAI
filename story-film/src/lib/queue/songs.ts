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

let queue: Queue<SongJob> | undefined;

export function getSongQueue(): Queue<SongJob> {
  queue ??= new Queue<SongJob>(SONG_QUEUE, { connection: getRedis() });
  return queue;
}
