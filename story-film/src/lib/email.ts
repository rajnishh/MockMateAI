// Sends sign-in codes by email. "console" just logs the code for local development;
// Resend sends real email once the sending domain is verified there.
export interface EmailSender {
  sendOtp(email: string, code: string): Promise<void>;
}

export class ConsoleEmail implements EmailSender {
  async sendOtp(email: string, code: string): Promise<void> {
    console.log(`[dev email] OTP for ${email}: ${code}`);
  }
}

export function otpEmail(code: string): { subject: string; text: string; html: string } {
  return {
    subject: `${code} is your Reelkar code`,
    text: `Your Reelkar sign-in code is ${code}. It works for 5 minutes.\n\nIf you didn't ask for it, you can ignore this email.`,
    html:
      `<p>Your Reelkar sign-in code is</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>` +
      `<p>It works for 5 minutes. If you didn't ask for it, you can ignore this email.</p>`,
  };
}

export class ResendEmail implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async sendOtp(email: string, code: string): Promise<void> {
    const res = await this.fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email], ...otpEmail(code) }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`Resend: ${body.message ?? res.status}`);
    }
  }
}

// Phone-only accounts get a placeholder address on this domain (see auth-config.ts); it can't receive mail.
export const PLACEHOLDER_EMAIL_DOMAIN = "phone.storyfilm.invalid";
