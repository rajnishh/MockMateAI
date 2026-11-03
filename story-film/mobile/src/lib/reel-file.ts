import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

import { api } from "./api";

// Fetches the finished video to the cache through its signed link (no cookie needed), every time,
// so a re-rendered edit is never shared from a stale copy.
async function downloadReel(id: string): Promise<File> {
  const url = await api.shareLink(id);
  return File.downloadFileAsync(url, new File(Paths.cache, `reelkar-${id}.mp4`), { idempotent: true });
}

export type SaveResult = "saved" | "denied" | "blocked";

// Add-only access is enough to save, so the creator never has to share their whole library.
// "blocked" means they said no before and only Settings can change it.
export async function saveReelToPhotos(id: string): Promise<SaveResult> {
  let permission = await MediaLibrary.getPermissionsAsync(true, ["video"]);
  if (!permission.granted && permission.canAskAgain) permission = await MediaLibrary.requestPermissionsAsync(true, ["video"]);
  if (!permission.granted) return permission.canAskAgain ? "denied" : "blocked";
  const file = await downloadReel(id);
  await MediaLibrary.Asset.create(file.uri);
  return "saved";
}

// The native share sheet with the video file itself, so WhatsApp and Instagram get the reel, not a link.
export async function shareReel(id: string, title?: string | null): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    const file = await downloadReel(id);
    await Sharing.shareAsync(file.uri, { mimeType: "video/mp4", UTI: "public.mpeg-4", dialogTitle: title ?? "Share your reel" });
    return;
  }
  const url = await api.shareLink(id);
  await Share.share({ message: [title, url].filter(Boolean).join("\n\n") });
}
