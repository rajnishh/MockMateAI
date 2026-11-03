"use client";

import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { findCountry, isValidMobile, PHONE_COUNTRIES, type PhoneCountry, toE164 } from "@/lib/phone";

export function LoginForm({ googleEnabled, next = "/" }: { googleEnabled: boolean; next?: string }) {
  const [country, setCountry] = useState<PhoneCountry>("IN");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneNumber = toE164(country, mobile);
  const info = findCountry(country);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (!isValidMobile(country, mobile)) return setError(`Enter a ${info.name} mobile number, like ${info.example}`);
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
    window.location.href = next;
  }

  return (
    <>
      {googleEnabled && (
        <>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}>
              Continue with Google
            </button>
          </div>
          <p className="muted" style={{ textAlign: "center" }}>or</p>
        </>
      )}
      {!sent ? (
        <form onSubmit={sendCode}>
          <label htmlFor="mobile">Mobile number</label>
          <div className="row keep">
            <select
              className="prefix"
              aria-label="Country"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value as PhoneCountry);
                setError(null);
              }}>
              {PHONE_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{`${c.name} ${c.dial}`}</option>
              ))}
            </select>
            <input
              id="mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder={info.example}
              maxLength={16}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/[^\d ]/g, ""))}
              required
            />
          </div>
          <div className="actions">
            <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label htmlFor="code">Enter the 6-digit code sent to {phoneNumber}</label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="otp-input"
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
