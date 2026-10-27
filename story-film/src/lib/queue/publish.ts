import { Queue } from "bullmq";
import { getRedis } from "./films";

export const PUBLISH_QUEUE = "publish";

export interface PublishJob {
  postId: string;
}

let queue: Queue<PublishJob> | undefined;

export function getPublishQueue(): Queue<PublishJob> {
  queue ??= new Queue<PublishJob>(PUBLISH_QUEUE, { connection: getRedis() });
  return queue;
}

// One delayed job per post (job id = post id, so re-adding is a no-op).
// Jobs are removed when done so a retried post can be queued again.
export async function enqueuePost(q: Pick<Queue<PublishJob>, "add">, post: { id: string; scheduledAt: Date }) {
  await q.add(
    "publish",
    { postId: post.id },
    { jobId: post.id, delay: Math.max(0, post.scheduledAt.getTime() - Date.now()), removeOnComplete: true, removeOnFail: true },
  );
}
