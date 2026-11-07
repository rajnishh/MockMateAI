import { useSyncExternalStore } from "react";
import { makeMutable } from "react-native-reanimated";

import { getItem, setItem } from "./storage";

// The camera bubble's side (Settings › "Camera button on the left") and its scroll shrink.
// design/v3.0/quick-create.md 2.1. Saved on this phone only.
const KEY = "reelkar.instantLeft";
let left = false;
const listeners = new Set<() => void>();
getItem(KEY).then((v) => {
  left = v === "1";
  listeners.forEach((l) => l());
}, () => undefined);

export function setInstantLeft(on: boolean) {
  left = on;
  listeners.forEach((l) => l());
  setItem(KEY, on ? "1" : null).catch(() => undefined);
}

export function useInstantLeft() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => left,
  );
}

// 1 while scrolling down: the bubble shrinks to 44 pt; scrolling up or stopping grows it back.
export const instantSmall = makeMutable(0);
let lastY = 0;
export const instantScrollProps = {
  scrollEventThrottle: 32,
  onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    if (Math.abs(y - lastY) < 6) return;
    instantSmall.value = y > lastY && y > 40 ? 1 : 0;
    lastY = y;
  },
  // A drag that ends with a flick keeps going; momentum end grows it back then.
  onScrollEndDrag: (e: { nativeEvent: { velocity?: { y: number } } }) => {
    if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.2) instantSmall.value = 0;
  },
  onMomentumScrollEnd: () => {
    instantSmall.value = 0;
  },
};
