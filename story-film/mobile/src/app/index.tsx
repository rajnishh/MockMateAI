import { type Href, Redirect } from "expo-router";
import { useState } from "react";

import { takeCreateLink, takeReelLink } from "@/lib/pending-link";
import { useSession } from "@/lib/session";

// Entry point: send people to sign-in, onboarding or Home (or a reel link they opened signed out).
export default function Index() {
  const { user, onboarded } = useSession();
  const [reel] = useState(() => (user && onboarded ? takeReelLink() : null));
  const [prompt] = useState(() => (user && onboarded ? takeCreateLink() : null));
  if (!user) return <Redirect href="/welcome" />;
  if (!onboarded) return <Redirect href="/quick-start" />;
  if (prompt) return <Redirect href={prompt as Href} />;
  return <Redirect href={reel ? `/reel/${reel}` : "/home"} />;
}
