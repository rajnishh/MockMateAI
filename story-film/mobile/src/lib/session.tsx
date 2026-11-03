import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { authClient } from "./auth-client";
import { DEMO } from "./config";
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
  signInWithGoogle: () => Promise<void>;
  // to is a mobile number in E.164 form ("+971501234567", see lib/phone.ts) or an email address.
  sendOtp: (to: string) => Promise<void>;
  verifyOtp: (to: string, code: string) => Promise<void>;
  savePrefs: (p: Prefs) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
const PREFS_KEY = "reelkar.prefs";
const ONBOARDED_KEY = "reelkar.onboarded";
const DEMO_USER_KEY = "reelkar.demoUser";

export const isEmail = (to: string) => to.includes("@");

// Demo mode has no backend to ask about the session.
const useRemoteSession = DEMO ? () => ({ data: null, isPending: false }) : authClient.useSession;

export function SessionProvider({ children }: { children: ReactNode }) {
  const remote = useRemoteSession();
  const [demoUser, setDemoUser] = useState<User | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, o, d] = await Promise.all([getItem(PREFS_KEY), getItem(ONBOARDED_KEY), getItem(DEMO_USER_KEY)]);
      if (p) setPrefs(JSON.parse(p));
      setOnboarded(o === "1");
      if (DEMO && d) setDemoUser(JSON.parse(d));
      setLoaded(true);
    })();
  }, []);

  const user: User | null = DEMO
    ? demoUser
    : remote.data?.user
      ? { id: remote.data.user.id, name: remote.data.user.name }
      : null;

  const signInDemo = useCallback(async () => {
    const u = { id: "demo", name: "Priya" };
    await setItem(DEMO_USER_KEY, JSON.stringify(u));
    setDemoUser(u);
  }, []);

  const value: SessionValue = {
    ready: loaded && (DEMO || !remote.isPending),
    user,
    prefs,
    onboarded,
    signInWithGoogle: async () => {
      if (DEMO) return signInDemo();
      const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (error) throw new Error(error.message ?? "Google sign-in didn't finish");
    },
    sendOtp: async (to) => {
      if (DEMO) return;
      const { error } = isEmail(to)
        ? await authClient.emailOtp.sendVerificationOtp({ email: to, type: "sign-in" })
        : await authClient.phoneNumber.sendOtp({ phoneNumber: to });
      if (error) throw new Error(error.message ?? "Couldn't send the code");
    },
    verifyOtp: async (to, code) => {
      if (DEMO) return signInDemo();
      const { error } = isEmail(to)
        ? await authClient.signIn.emailOtp({ email: to, otp: code })
        : await authClient.phoneNumber.verify({ phoneNumber: to, code });
      if (error) throw new Error(error.message ?? "That code didn't match");
    },
    savePrefs: async (p) => {
      await setItem(PREFS_KEY, JSON.stringify(p));
      setPrefs(p);
    },
    finishOnboarding: async () => {
      await setItem(ONBOARDED_KEY, "1");
      setOnboarded(true);
    },
    signOut: async () => {
      await setItem(ONBOARDED_KEY, null);
      setOnboarded(false);
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
