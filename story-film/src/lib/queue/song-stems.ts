import { Queue } from "bullmq";
import { getRedis } from "./films";

export const SONG_STEMS_QUEUE = "song-stems";

// Splits a finished song into stems for the Studio's mixer. The stems are files next to the song.
export interface StemsJob {
  songId: string;
  userId: string;
  // The song file and the stems folder, both built by the API route from the worker's own paths.
  songFile: string;
  dir: string;
  credits: number;
  // The ledger ref the credits were spent under, for the refund.
  ref: string;
}

let queue: Queue<StemsJob> | undefined;

export function getSongStemsQueue(): Queue<StemsJob> {
  queue ??= new Queue<StemsJob>(SONG_STEMS_QUEUE, { connection: getRedis() });
  return queue;
}
