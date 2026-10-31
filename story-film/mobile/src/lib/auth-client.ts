import { expoClient } from "@better-auth/expo/client";
import { phoneNumberClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { API_URL, SCHEME } from "./config";

// Sessions are kept in the device's secure storage (Keychain / Keystore).
export const authClient = createAuthClient({
  baseURL: API_URL || "http://localhost:3000",
  plugins: [expoClient({ scheme: SCHEME, storagePrefix: SCHEME, storage: SecureStore }), phoneNumberClient()],
});
