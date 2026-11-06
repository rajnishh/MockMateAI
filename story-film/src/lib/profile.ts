import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { findAvatar } from "@/lib/avatars";
import type { Db } from "@/lib/db";
import { profileAvatar, user } from "@/lib/db/schema";
import { getProfile, nextHandleChange, setHandle, suggestHandles } from "@/lib/listen";
import { deletePhoto, photoType, photoUrl, savePhoto } from "@/lib/photos";

// The creator's profile: display name (user.name), the unique @handle Listen already uses
// (creator_profile, src/lib/listen.ts) and a photo (profile_avatar). First-time onboarding asks
// for all three and every one can be skipped; the app nudges until the profile is complete.

export const NAME_MAX = 40;

// Names the account gets before the person picks one: phone sign-ups are "Creator 1234",
// email sign-ups can start empty or as the address.
export function isPlaceholderName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return !n || /^creator( [0-9a-z]{4})?$/i.test(n) || n.includes("@");
}

export function nameProblem(raw: string): string | null {
  const n = raw.trim();
  if (!n) return "Add your name.";
  if (n.length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`;
  if (/[<>\p{Cc}]/u.test(n)) return "Use letters, numbers and spaces.";
  return null;
}

export type AvatarView = { preset: string; url?: undefined } | { url: string; preset?: undefined } | null;
type AvatarRow = { preset: string | null; photo: string | null; updatedAt: Date } | null | undefined;

// What the app shows; `url` is the photo's route, versioned so a new photo isn't cached as the old one.
export function avatarView(row: AvatarRow, url: string): AvatarView {
  if (row?.preset && findAvatar(row.preset)) return { preset: row.preset };
  if (row?.photo) return { url: `${url}?v=${row.updatedAt.getTime()}` };
  return null;
}

export const MY_PHOTO_URL = "/api/me/profile/photo";
export const creatorPhotoUrl = (handle: string) => `/api/listen/creators/${encodeURIComponent(handle)}/photo`;

async function avatarRow(db: Db, userId: string) {
  const [row] = await db.select().from(profileAvatar).where(eq(profileAvatar.userId, userId));
  return row;
}

export async function myProfile(db: Db, userId: string) {
  const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const handle = await getProfile(db, userId);
  const avatar = avatarView(await avatarRow(db, userId), MY_PHOTO_URL);
  const name = isPlaceholderName(me?.name) ? "" : me!.name;
  const missing = [!name && "name", !handle && "handle", !avatar && "photo"].filter(Boolean) as ("name" | "handle" | "photo")[];
  return {
    name,
    handle: handle?.handle ?? null,
    canChangeAt: handle ? nextHandleChange(handle.handleChangedAt).toISOString() : null,
    suggestions: handle ? [] : await suggestHandles(db, name),
    avatar,
    missing,
    complete: missing.length === 0,
  };
}

export type MyProfile = Awaited<ReturnType<typeof myProfile>>;

export const profileSchema = z.object({
  name: z.string().max(100).optional(),
  handle: z.string().max(40).optional(),
  // A ready-made avatar's key; null clears the photo.
  avatar: z.string().max(40).nullable().optional(),
});

type Field = "name" | "handle" | "avatar";

// Saves whatever was given. Empty fields are left as they are (skipping is fine). The handle goes
// first since it's the one most likely to be refused, and the whole save stops at the first problem.
export async function saveProfile(
  db: Db,
  outputDir: string,
  userId: string,
  input: z.infer<typeof profileSchema>,
  now = new Date(),
): Promise<{ ok: true } | { error: string; field: Field; status: number }> {
  const name = input.name?.trim();
  if (name) {
    const problem = nameProblem(name);
    if (problem) return { error: problem, field: "name", status: 400 };
  }
  if (input.avatar && !findAvatar(input.avatar)) return { error: "Pick one of the avatars.", field: "avatar", status: 400 };
  const handle = input.handle?.trim().replace(/^@/, "");
  if (handle) {
    const r = await setHandle(db, userId, handle, now);
    if ("error" in r) return { error: r.error, field: "handle", status: r.status };
  }
  if (name) await db.update(user).set({ name }).where(eq(user.id, userId));
  if (input.avatar !== undefined) {
    const old = await avatarRow(db, userId);
    if (input.avatar === null) await db.delete(profileAvatar).where(eq(profileAvatar.userId, userId));
    else await upsertAvatar(db, userId, { preset: input.avatar, photo: null, updatedAt: now });
    if (old?.photo) await deletePhoto(outputDir, userId, old.photo);
  }
  return { ok: true };
}

async function upsertAvatar(db: Db, userId: string, set: { preset: string | null; photo: string | null; updatedAt: Date }) {
  await db
    .insert(profileAvatar)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: profileAvatar.userId, set });
}

// Stores an uploaded photo as the profile photo, kept with the user's other photos.
export async function setProfilePhoto(db: Db, outputDir: string, userId: string, data: Buffer, now = new Date()): Promise<boolean> {
  if (!photoType(data)) return false;
  const id = await savePhoto(outputDir, userId, data);
  if (!id) return false;
  const old = await avatarRow(db, userId);
  await upsertAvatar(db, userId, { preset: null, photo: id, updatedAt: now });
  if (old?.photo && old.photo !== id) await deletePhoto(outputDir, userId, old.photo);
  return true;
}

// The uploaded profile photo on disk, for the routes that serve it.
export async function profilePhotoFile(db: Db, outputDir: string, userId: string): Promise<{ file: string; type: string } | undefined> {
  const row = await avatarRow(db, userId);
  if (!row?.photo) return undefined;
  const url = await photoUrl(outputDir, userId, row.photo);
  if (!url) return undefined;
  const ext = row.photo.split(".").pop();
  return { file: fileURLToPath(url), type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" };
}
