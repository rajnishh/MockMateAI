import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import { api } from "./api";
import { getItem, setItem } from "./storage";

// "New in Inbox" for the Home bell and the You tab (design/v3.0/navigation.md §3), with no server change:
// anything newer than the last time Inbox was opened counts. A server count can replace this later.
const SEEN_KEY = "inbox.seenAt";

let unread = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(n: number) => void>();

function publish(n: number) {
  unread = n;
  listeners.forEach((l) => l(n));
}

export function refreshInboxUnread(): Promise<void> {
  inFlight ??= (async () => {
    try {
      let seen = await getItem(SEEN_KEY);
      // First run: start counting from now, so what was already in the old Inbox tab isn't called new.
      if (!seen) {
        seen = new Date().toISOString();
        await setItem(SEEN_KEY, seen);
      }
      const since = Date.parse(seen);
      const [gifts, duets, remixes] = await Promise.all([
        api.gifts().catch(() => null),
        api.duets().catch(() => []),
        api.remixInbox().catch(() => []),
      ]);
      const times = [...(gifts?.replies ?? []).map((r) => r.createdAt), ...duets.map((d) => d.createdAt), ...remixes.map((r) => r.at)];
      publish(times.filter((t) => Date.parse(t) > since).length);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Inbox calls this each time it opens.
export async function markInboxSeen(): Promise<void> {
  publish(0);
  await setItem(SEEN_KEY, new Date().toISOString());
}

// How many things are new in Inbox; re-checks when the app comes to the front or a notification arrives.
export function useInboxUnread(): number {
  const [n, setN] = useState(unread);
  useEffect(() => {
    listeners.add(setN);
    refreshInboxUnread().catch(() => undefined);
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") refreshInboxUnread().catch(() => undefined);
    });
    const push = Platform.OS === "web" ? null : Notifications.addNotificationReceivedListener(() => refreshInboxUnread().catch(() => undefined));
    return () => {
      listeners.delete(setN);
      app.remove();
      push?.remove();
    };
  }, []);
  return n;
}
