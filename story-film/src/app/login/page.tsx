import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, googleEnabled } from "@/lib/auth";
import { ReelLogo } from "../reel-logo";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/");
  return (
    <main>
      <div className="brand">
        <ReelLogo size={48} label="Reelkar" />
        <h1>Reelkar</h1>
      </div>
      <p className="muted">Sign in to make reels, cartoons and short films.</p>
      <LoginForm googleEnabled={googleEnabled} />
    </main>
  );
}
