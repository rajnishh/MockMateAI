"use client";

import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { findCountry, isValidMobile, PHONE_COUNTRIES, type PhoneCountry, toE164 } from "@/lib/phone";

type Method = "phone" | "email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ googleEnabled, next = "/" }: { googleEnabled: boolean; next?: string }) {
  const [method, setMethod] = useState<Method>("phone");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState<PhoneCountry>("IN");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneNumber = toE164(country, mobile);
  const info = findCountry(country);
  const address = email.trim().toLowerCase();

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (method === "phone" && !isValidMobile(country, mobile)) return setError(`Enter a ${info.name} mobile number, like ${info.example}`);
    if (method === "email" && !EMAIL.test(address)) return setError("Enter your email address, like name@example.com");
    setBusy(true);
    setError(null);
    const { error } =
      method === "phone"
        ? await authClient.phoneNumber.sendOtp({ phoneNumber })
        : await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
    setBusy(false);
    if (error) return setError(error.message ?? "Couldn't send the code");
    setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } =
      method === "phone"
        ? await authClient.phoneNumber.verify({ phoneNumber, code })
        : await authClient.signIn.emailOtp({ email: address, otp: code });
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
          <div className="tabs" role="group" aria-label="Sign in with">
            {(["phone", "email"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => {
                  setMethod(m);
                  setError(null);
                }}>
                {m === "phone" ? "Mobile number" : "Email"}
              </button>
            ))}
          </div>
          {method === "email" ? (
            <>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </>
          ) : (
            <>
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
            </>
          )}
          <div className="actions">
            <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label htmlFor="code">Enter the 6-digit code sent to {method === "phone" ? phoneNumber : address}</label>
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
          {method === "email" && <p className="muted">Not in your inbox? Check spam or promotions.</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
            <button type="button" className="secondary" onClick={() => setSent(false)}>
              {method === "phone" ? "Change number" : "Change email"}
            </button>
          </div>
        </form>
      )}
      {error && <div className="status">{error}</div>}
    </>
  );
}
