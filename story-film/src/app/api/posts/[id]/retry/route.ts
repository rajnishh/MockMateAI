import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { postView, retryPost } from "@/lib/posts";
import { enqueuePost, getPublishQueue } from "@/lib/queue/publish";
import { getUserId, unauthorized } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const post = await retryPost(getDb(), userId, id).catch(() => undefined);
  if (!post) return NextResponse.json({ error: "Only failed posts can be retried" }, { status: 409 });
  await enqueuePost(getPublishQueue(), post);
  return NextResponse.json({ post: postView(post) });
}
