import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";

import { api } from "./api";
import { DEMO } from "./config";
import { getItem, setItem } from "./storage";

// Push notifications: songs and reels ready (or not), gifts and Jugalbandis. The token needs the
// EAS project id in app.json (extra.eas.projectId); without it the app simply doesn't register.
// Reelkar asks only at a moment that explains why: after a song or reel is made (PushOffer),
// after sending a gift, or starting a Jugalbandi. Never on first launch.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const TOKEN_KEY = "reelkar.pushToken";
const OFFERED_KEY = "reelkar.pushOffered";

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

// Pushes are written in the phone's language when Reelkar writes it (English, Hindi, Arabic).
export function phoneLang(): "en" | "hi" | "ar" {
  const code = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2).toLowerCase();
  return code === "hi" || code === "ar" ? code : "en";
}

// ask: show the system prompt if it hasn't been answered. Without ask, it registers only if
// already allowed. A simulator can be asked but has no push token to save.
export async function registerForPush(ask: boolean): Promise<boolean> {
  if (Platform.OS === "web") return false;
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && ask && canAskAgain) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted" || !Device.isDevice || !projectId()) return false;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await api.savePushToken(data, Platform.OS === "android" ? "android" : "ios", phoneLang());
  await setItem(TOKEN_KEY, data);
  return true;
}

// On sign-out, while the session still works: this phone stops getting the creator's pushes.
export async function unregisterForPush(): Promise<void> {
  const token = await getItem(TOKEN_KEY);
  if (!token) return;
  await setItem(TOKEN_KEY, null);
  if (!DEMO) await api.deletePushToken(token).catch(() => undefined);
}

// The "Tell me when it's ready" card shows once, and only before iOS has asked.
export async function shouldOfferPush(): Promise<boolean> {
  if (Platform.OS === "web" || (await getItem(OFFERED_KEY))) return false;
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return status !== "granted" && canAskAgain;
}

export async function dismissPushOffer(): Promise<void> {
  await setItem(OFFERED_KEY, "1");
}

// For Account: on, off in iPhone Settings, or not asked yet.
export type PushPermission = "on" | "off" | "ask";

export async function pushPermission(): Promise<PushPermission> {
  if (Platform.OS === "web") return "off";
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "on" : canAskAgain ? "ask" : "off";
}

// Tapping a notification opens the screen it's about.
export function listenForTaps(): () => void {
  const open = (r: Notifications.NotificationResponse | null) => {
    const path = r?.notification.request.content.data?.path;
    if (typeof path === "string" && path.startsWith("/")) router.push(path as never);
  };
  Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
