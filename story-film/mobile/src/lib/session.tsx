import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { authClient } from "./auth-client";
import { DEMO } from "./config";
import { unregisterForPush } from "./push";
import { decodePendingSignIn, encodePendingSignIn, nextReady, type PendingSignIn } from "./sign-in-state";
import { getItem, setItem } from "./storage";

export interface Brand {
  // Brand colour for motion reels; empty lets the AI pick a theme.
  accent?: string;
  background?: "light" | "dark";
  handle?: string;
}

export interface Prefs {
  brand?: Brand;
  topic: string;
  niche: string;
  language: string;
  experience: "new" | "existing";
}

export interface User {
  id: string;
  name: string;
}

interface SessionValue {
  ready: boolean;
  user: User | null;
  prefs: Prefs | null;
  onboarded: boolean;
  // A code sent in the last few minutes and not used yet, so sign-in can carry on after a restart.
  pendingSignIn: PendingSignIn | null;
  clearPendingSignIn: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  // iPhone only. Resolves false when the person cancels Apple's sheet.
  signInWithApple: () => Promise<boolean>;
  // to is a mobile number in E.164 form ("+971501234567", see lib/phone.ts) or an email address.
  sendOtp: (to: string) => Promise<void>;
  verifyOtp: (to: string, code: string) => Promise<void>;
  savePrefs: (p: Prefs) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  // After the name changes in the profile, so Home and Account greet people by it.
  refreshUser: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
const PREFS_KEY = "reelkar.prefs";
const ONBOARDED_KEY = "reelkar.onboarded";
const DEMO_USER_KEY = "reelkar.demoUser";
const PENDING_SIGN_IN_KEY = "reelkar.pendingSignIn";

export const isEmail = (to: string) => to.includes("@");

// Demo mode has no backend to ask about the session.
const useRemoteSession: () => { data: { user: { id: string; name: string } } | null; isPending: boolean; refetch?: () => Promise<unknown> } = DEMO
  ? () => ({ data: null, isPending: false })
  : authClient.useSession;

export function SessionProvider({ children }: { children: ReactNode }) {
  const remote = useRemoteSession();
  const [demoUser, setDemoUser] = useState<User | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [pendingSignIn, setPendingSignIn] = useState<PendingSignIn | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [wasReady, setWasReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, o, d, s] = await Promise.all([
        getItem(PREFS_KEY),
        getItem(ONBOARDED_KEY),
        getItem(DEMO_USER_KEY),
        getItem(PENDING_SIGN_IN_KEY),
      ]);
      if (p) setPrefs(JSON.parse(p));
      setOnboarded(o === "1");
      if (DEMO && d) setDemoUser(JSON.parse(d));
      setPendingSignIn(decodePendingSignIn(s));
      setLoaded(true);
    })();
  }, []);

  // See nextReady: a session refetch when the app comes back to the front must not unready it.
  const ready = nextReady(wasReady, loaded, !DEMO && remote.isPending);
  if (ready && !wasReady) setWasReady(true);

  const user: User | null = DEMO
    ? demoUser
    : remote.data?.user
      ? { id: remote.data.user.id, name: remote.data.user.name }
      : null;

  const clearPendingSignIn = useCallback(async () => {
    setPendingSignIn(null);
    await setItem(PENDING_SIGN_IN_KEY, null);
  }, []);

  const signInDemo = useCallback(async () => {
    const u = { id: "demo", name: "Priya" };
    await setItem(DEMO_USER_KEY, JSON.stringify(u));
    setDemoUser(u);
  }, []);

  const value: SessionValue = {
    ready,
    user,
    prefs,
    onboarded,
    pendingSignIn,
    clearPendingSignIn,
    signInWithGoogle: async () => {
      if (DEMO) return signInDemo();
      const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (error) throw new Error(error.message ?? "Google sign-in didn't finish");
      await clearPendingSignIn();
    },
    signInWithApple: async () => {
      if (DEMO) return signInDemo().then(() => true);
      // Apple puts the SHA-256 of this nonce in its token; the server checks it against the raw one.
      const nonce = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      let cred: AppleAuthentication.AppleAuthenticationCredential;
      try {
        cred = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
          nonce: hashed,
        });
      } catch (err) {
        if ((err as { code?: string }).code === "ERR_REQUEST_CANCELED") return false;
        throw new Error("Apple sign-in didn't finish");
      }
      if (!cred.identityToken) throw new Error("Apple sign-in didn't finish");
      // Apple shares the name only the first time, so it goes along with the token.
      const name = cred.fullName?.givenName || cred.fullName?.familyName
        ? { firstName: cred.fullName?.givenName ?? "", lastName: cred.fullName?.familyName ?? "" }
        : undefined;
      const { error } = await authClient.signIn.social({
        provider: "apple",
        idToken: { token: cred.identityToken, nonce, ...(name ? { user: { name, email: cred.email ?? undefined } } : {}) },
      });
      if (error) throw new Error(error.message ?? "Apple sign-in didn't finish");
      await clearPendingSignIn();
      return true;
    },
    sendOtp: async (to) => {
      if (!DEMO) {
        const { error } = isEmail(to)
          ? await authClient.emailOtp.sendVerificationOtp({ email: to, type: "sign-in" })
          : await authClient.phoneNumber.sendOtp({ phoneNumber: to });
        if (error) throw new Error(error.message ?? "Couldn't send the code");
      }
      const raw = encodePendingSignIn(to);
      setPendingSignIn(decodePendingSignIn(raw));
      await setItem(PENDING_SIGN_IN_KEY, raw);
    },
    verifyOtp: async (to, code) => {
      if (DEMO) await signInDemo();
      else {
        const { error } = isEmail(to)
          ? await authClient.signIn.emailOtp({ email: to, otp: code })
          : await authClient.phoneNumber.verify({ phoneNumber: to, code });
        if (error) throw new Error(error.message ?? "That code didn't match");
      }
      await clearPendingSignIn();
    },
    savePrefs: async (p) => {
      await setItem(PREFS_KEY, JSON.stringify(p));
      setPrefs(p);
    },
    finishOnboarding: async () => {
      await setItem(ONBOARDED_KEY, "1");
      setOnboarded(true);
    },
    refreshUser: async (name) => {
      if (DEMO) {
        if (!demoUser) return;
        const u = { ...demoUser, name };
        await setItem(DEMO_USER_KEY, JSON.stringify(u));
        setDemoUser(u);
      } else await remote.refetch?.();
    },
    signOut: async () => {
      // While the session still works, so the server lets this phone's push token go.
      await unregisterForPush().catch(() => undefined);
      await setItem(ONBOARDED_KEY, null);
      setOnboarded(false);
      await clearPendingSignIn();
      if (DEMO) {
        await setItem(DEMO_USER_KEY, null);
        setDemoUser(null);
      } else await authClient.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
