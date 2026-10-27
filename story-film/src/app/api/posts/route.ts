import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { createPost, listPosts, newPostSchema, PostError, postView } from "@/lib/posts";
import { enqueuePost, getPublishQueue } from "@/lib/queue/publish";
import { getUserId, unauthorized } from "@/lib/session";

const rangeSchema = z.object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) });

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const range = rangeSchema.safeParse(params);
  if (!range.success) return NextResponse.json({ error: "from and to are required ISO dates" }, { status: 400 });
  const rows = await listPosts(getDb(), userId, new Date(range.data.from), new Date(range.data.to));
  return NextResponse.json({ posts: rows.map((r) => postView(r.post, { accountName: r.accountName })) });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const parsed = newPostSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  try {
    const post = await createPost(getDb(), userId, parsed.data);
    await enqueuePost(getPublishQueue(), post);
    return NextResponse.json({ post: postView(post) }, { status: 201 });
  } catch (err) {
    if (err instanceof PostError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
