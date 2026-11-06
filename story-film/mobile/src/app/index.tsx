import { Redirect } from "expo-router";
import { useState } from "react";

import { takeReelLink } from "@/lib/pending-link";
import { useSession } from "@/lib/session";

// Entry point: send people to sign-in, onboarding or Home (or a reel link they opened signed out).
export default function Index() {
  const { user, onboarded, pendingSignIn } = useSession();
  const [reel] = useState(() => (user && onboarded ? takeReelLink() : null));
  // A code was sent just before iOS closed the app: go straight back to entering it.
  if (!user && pendingSignIn) return <Redirect href={{ pathname: "/otp", params: { to: pendingSignIn.to } }} />;
  if (!user) return <Redirect href="/welcome" />;
  if (!onboarded) return <Redirect href="/quick-start" />;
  return <Redirect href={reel ? `/reel/${reel}` : "/home"} />;
}
