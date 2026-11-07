import { getRecordingPermissionsAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import { useSyncExternalStore } from "react";
import { Alert, Linking } from "react-native";

// What Film, Snap or Gallery just gave us, kept in memory (never in a URL) until a maker takes it, so
// "What should we make?" and a retry never mean filming again. design/v3.0/capture.md, quick-create.md
export interface Captured {
  kind: "video" | "photo";
  uri: string;
  name: string;
  type: string;
  seconds: number | null;
  mb: number | null;
  // Gallery picks are still in Photos, so leaving one needs no "Discard this clip?".
  source: "camera" | "gallery";
}

// Same limits as Edit my video: the free plan's 60-second reels, and Cloudflare's 100 MB upload cap.
export const CAPTURE_MAX_SEC = 60;
export const CAPTURE_MAX_MB = 95;
// Copy my moves: the server takes a dance clip up to 15 s and 40 MB.
export const MOVES_MAX_SEC = 15;
export const MOVES_MAX_MB = 40;

let current: Captured | null = null;
export const capture = {
  set: (c: Captured) => {
    current = c;
  },
  get: () => current,
  clear: () => {
    current = null;
  },
  // A maker takes the clip once; Back from it to "What should we make?" keeps nothing stale.
  take: () => {
    const c = current;
    current = null;
    return c;
  },
};

// iOS exports a gallery video to 1080p before handing it over, which takes a few seconds; the Gallery
// tile says "Preparing…" meanwhile so a tap never looks ignored.
let preparing = false;
const listeners = new Set<() => void>();
function setPreparing(v: boolean) {
  preparing = v;
  listeners.forEach((l) => l());
}
export function usePreparing() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => preparing,
  );
}

function fromAsset(a: ImagePicker.ImagePickerAsset, source: Captured["source"]): Captured {
  const video = a.type === "video";
  const type = a.mimeType ?? (video ? "video/mp4" : "image/jpeg");
  return {
    kind: video ? "video" : "photo",
    uri: a.uri,
    name: a.fileName ?? `${video ? "clip" : "photo"}-${Date.now()}.${video ? "mp4" : type === "image/png" ? "png" : "jpg"}`,
    type,
    seconds: video && a.duration ? a.duration / 1000 : null,
    mb: a.fileSize ? a.fileSize / 1048576 : null,
    source,
  };
}

// A native alert that answers with the value of the button tapped (or `none` if dismissed).
function ask<T>(title: string, body: string, none: T, buttons: { text: string; style?: "cancel" | "destructive"; value: T }[]) {
  return new Promise<T>((resolve) =>
    Alert.alert(
      title,
      body,
      buttons.map((b) => ({ text: b.text, style: b.style, onPress: () => resolve(b.value) })),
      { cancelable: true, onDismiss: () => resolve(none) },
    ),
  );
}

// The camera, asked for only when Film or Snap is tapped (capture.md 5): a short why before the first
// system prompt, and Settings or the gallery once it's been turned off.
async function cameraReady(): Promise<boolean> {
  let perm = await ImagePicker.getCameraPermissionsAsync();
  if (perm.granted) return true;
  if (perm.canAskAgain) {
    if (perm.status === "undetermined") {
      const go = await ask("Film with Reelkar", "We use the camera only when you tap Film or Snap. Nothing is recorded until you press the red button.", false, [
        { text: "Not now", style: "cancel", value: false },
        { text: "Continue", value: true },
      ]);
      if (!go) return false;
    }
    perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.granted) return true;
  }
  const next = await ask("Camera is off for Reelkar.", "Turn on Camera for Reelkar in Settings, or choose something you filmed earlier.", "none", [
    { text: "Not now", style: "cancel", value: "none" },
    { text: "Open Settings", value: "settings" },
    { text: "Choose from gallery", value: "gallery" },
  ]);
  if (next === "settings") Linking.openSettings().catch(() => undefined);
  if (next === "gallery") await chooseFromGallery();
  return false;
}

// A video without sound can't get captions or a song, so say so before filming (capture.md 5).
async function micOkay(): Promise<boolean> {
  const mic = await getRecordingPermissionsAsync().catch(() => null);
  if (!mic || mic.granted || mic.canAskAgain) return true;
  const next = await ask("Microphone is off", "Your video will have no sound. Captions and songs need your voice.", "none", [
    { text: "Not now", style: "cancel", value: "none" },
    { text: "Open Settings", value: "settings" },
    { text: "Film anyway", value: "film" },
  ]);
  if (next === "settings") Linking.openSettings().catch(() => undefined);
  return next === "film";
}

// The system camera: video (front, up to 60 s, iOS's trimmer, 1080p HEVC like the gallery) or a photo.
// Returns what was shot, also kept in the store; null if cancelled or not allowed.
export async function shoot(kind: "video" | "photo"): Promise<Captured | null> {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  if (!(await cameraReady())) return null;
  if (kind === "video" && !(await micOkay())) return null;
  const res =
    kind === "video"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["videos"],
          videoMaxDuration: CAPTURE_MAX_SEC,
          allowsEditing: true,
          cameraType: ImagePicker.CameraType.front,
          videoExportPreset: ImagePicker.VideoExportPreset.HEVC_1920x1080,
        })
      : await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], cameraType: ImagePicker.CameraType.front, quality: 0.85 });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  const c = fromAsset(a, "camera");
  capture.set(c);
  return c;
}

// A photo or a video from the gallery. trim: iOS's own trimmer, held to 60 s, for a clip that's too long.
// iPhone photos are HEIC, which the server doesn't take, so iOS hands over a JPEG copy.
export async function pick(trim = false): Promise<Captured | null> {
  if (preparing) return null;
  setPreparing(true);
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: trim ? ["videos"] : ["images", "videos"],
    allowsEditing: trim,
    videoMaxDuration: CAPTURE_MAX_SEC,
    quality: 0.9,
    videoExportPreset: ImagePicker.VideoExportPreset.HEVC_1920x1080,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  })
    .catch((err: Error) => {
      Alert.alert("Couldn't open that", err.message);
      return null;
    })
    .finally(() => setPreparing(false));
  const a = !res || res.canceled ? null : res.assets[0];
  if (!a) return null;
  const c = fromAsset(a, "gallery");
  capture.set(c);
  return c;
}

// Film now (Film tile, chilli long-press, camera bubble), Snap, or Gallery, then "What should we make?".
export async function filmNow() {
  if (await shoot("video")) router.push("/capture");
}
export async function snapPhoto() {
  if (await shoot("photo")) router.push("/capture");
}
export async function chooseFromGallery() {
  if (await pick()) router.push("/capture");
}

// "Save clip to Photos" after a failed upload: add-only access, so the whole library stays private.
export async function saveClip(uri: string): Promise<"saved" | "denied" | "blocked"> {
  let perm = await MediaLibrary.getPermissionsAsync(true, ["video", "photo"]);
  if (!perm.granted && perm.canAskAgain) perm = await MediaLibrary.requestPermissionsAsync(true, ["video", "photo"]);
  if (!perm.granted) return perm.canAskAgain ? "denied" : "blocked";
  await MediaLibrary.Asset.create(uri);
  return "saved";
}
