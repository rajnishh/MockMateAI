import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { api } from "./api";

// Push notifications for gifts and Jugalbandis. The token needs the EAS project id in app.json
// (`npx eas init` sets extra.eas.projectId once); without it the app simply doesn't register.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

// ask: show the system prompt if it hasn't been answered (only at a moment that explains why, like
// after sending a gift). Without ask, it registers only if already allowed.
export async function registerForPush(ask: boolean): Promise<boolean> {
  if (!Device.isDevice || !projectId()) return false;
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && ask && canAskAgain) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return false;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await api.savePushToken(data);
  return true;
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
