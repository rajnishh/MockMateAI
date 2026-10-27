import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, googleEnabled } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/");
  return (
    <main>
      <h1>Story to Film</h1>
      <p className="muted">Sign in to make reels, cartoons and short films.</p>
      <LoginForm googleEnabled={googleEnabled} />
    </main>
  );
}
