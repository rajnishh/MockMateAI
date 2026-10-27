import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cancelPost } from "@/lib/posts";
import { getPublishQueue } from "@/lib/queue/publish";
import { getUserId, unauthorized } from "@/lib/session";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  if (!(await cancelPost(getDb(), userId, id).catch(() => false))) {
    return NextResponse.json({ error: "Only scheduled or failed posts can be cancelled" }, { status: 409 });
  }
  // The publisher skips cancelled posts anyway; removing the job just tidies the queue.
  await getPublishQueue().remove(id).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
