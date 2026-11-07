import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Alert, Linking } from "react-native";

// What the camera bubble or a chilli long-press just filmed, kept in memory (never in a URL) until a
// maker takes it, so "What should we make?" and a retry never mean filming again. design/v3.0/quick-create.md
export interface Captured {
  uri: string;
  name: string;
  type: string;
  seconds: number | null;
  mb: number | null;
}

// Same limits as Edit my video: the free plan's 60-second reels, and Cloudflare's 100 MB upload cap.
export const CAPTURE_MAX_SEC = 60;
export const CAPTURE_MAX_MB = 95;

let current: Captured | null = null;
export const capture = {
  set: (c: Captured) => {
    current = c;
  },
  get: () => current,
  // A maker takes the clip once; Back from it to "What should we make?" keeps nothing stale.
  take: () => {
    const c = current;
    current = null;
    return c;
  },
};

// Film now: the system camera (front, up to 60 s, 1080p HEVC like the gallery), then "What should we make?".
export async function filmNow() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Camera is off for Reelkar", "Turn on Camera for Reelkar in Settings to film.", [
      { text: "Not now", style: "cancel" },
      ...(perm.canAskAgain ? [] : [{ text: "Open Settings", onPress: () => Linking.openSettings() }]),
    ]);
    return;
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ["videos"],
    videoMaxDuration: CAPTURE_MAX_SEC,
    cameraType: ImagePicker.CameraType.front,
    videoExportPreset: ImagePicker.VideoExportPreset.HEVC_1920x1080,
  });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return;
  capture.set({
    uri: a.uri,
    name: a.fileName ?? `clip-${Date.now()}.mp4`,
    type: a.mimeType ?? "video/mp4",
    seconds: a.duration ? a.duration / 1000 : null,
    mb: a.fileSize ? a.fileSize / 1048576 : null,
  });
  router.push("/capture");
}
