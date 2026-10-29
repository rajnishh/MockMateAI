import { Redirect } from "expo-router";

import { useSession } from "@/lib/session";

// Entry point: send people to sign-in, onboarding or Home.
export default function Index() {
  const { user, onboarded } = useSession();
  if (!user) return <Redirect href="/welcome" />;
  return <Redirect href={onboarded ? "/home" : "/quick-start"} />;
}
