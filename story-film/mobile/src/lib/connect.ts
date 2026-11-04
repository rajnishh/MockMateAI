import * as WebBrowser from "expo-web-browser";

import { api, type SocialPlatform } from "./api";
import { DEMO, SCHEME } from "./config";

const RETURN_URL = `${SCHEME}://connected`;

// Opens Instagram's or Google's sign-in in the in-app browser; the backend sends the person
// back to reelkar://connected with the outcome. Resolves true when connected, false if cancelled.
export async function connectAccount(platform: SocialPlatform): Promise<boolean> {
  const url = await api.connectUrl(platform);
  if (DEMO) return true;
  const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
  if (result.type !== "success") return false;
  const error = new URL(result.url).searchParams.get("error");
  if (error) throw new Error(error);
  return true;
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = { instagram: "Instagram", youtube: "YouTube" };
