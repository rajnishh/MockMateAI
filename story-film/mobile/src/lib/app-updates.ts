import * as Updates from "expo-updates";
import { useEffect } from "react";
import { AppState } from "react-native";

// Over-the-air updates (EAS Update, channel "production"): new app code reaches phones without a
// reinstall, so creators stay signed in. An update is downloaded in the background and applied the
// next time the app comes to the front, before anything is on screen to lose. Native changes (new
// modules, permissions) still need a new build, and a new build only takes updates made for it.
export function useAppUpdates() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let ready = false;
    let checking = false;
    const check = async () => {
      if (ready) return Updates.reloadAsync().catch(() => undefined);
      if (checking) return;
      checking = true;
      try {
        if ((await Updates.checkForUpdateAsync()).isAvailable) ready = (await Updates.fetchUpdateAsync()).isNew;
      } catch {
        // Offline or the update server is down: try again next time.
      } finally {
        checking = false;
      }
    };
    check();
    const sub = AppState.addEventListener("change", (state) => state === "active" && check());
    return () => sub.remove();
  }, []);
}
