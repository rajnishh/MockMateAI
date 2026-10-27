"use client";

import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneNumber = `+91${mobile}`;

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber });
    setBusy(false);
    if (error) return setError(error.message ?? "Couldn't send the code");
    setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.phoneNumber.verify({ phoneNumber, code });
    setBusy(false);
    if (error) return setError(error.message ?? "Wrong code");
    window.location.href = "/";
  }

  return (
    <>
      {googleEnabled && (
        <>
          <button type="button" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}>
            Continue with Google
          </button>
          <p className="muted" style={{ textAlign: "center" }}>or</p>
        </>
      )}
      {!sent ? (
        <form onSubmit={sendCode}>
          <label htmlFor="mobile">Mobile number</label>
          <div className="row">
            <span className="prefix">+91</span>
            <input
              id="mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <div className="actions">
            <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label htmlFor="code">Enter the 6-digit code sent to +91 {mobile}</label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
          <div className="actions">
            <button type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
            <button type="button" className="secondary" onClick={() => setSent(false)}>Change number</button>
          </div>
        </form>
      )}
      {error && <div className="status">{error}</div>}
    </>
  );
}
