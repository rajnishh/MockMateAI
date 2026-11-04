// Sends login OTPs. Indian SMS needs a DLT-registered sender and template,
// which MSG91 manages. UAE SMS needs MSG91's international route turned on.
// "console" just logs the code for local development.
export interface SmsSender {
  sendOtp(phoneNumber: string, code: string): Promise<void>;
}

export class ConsoleSms implements SmsSender {
  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    console.log(`[dev sms] OTP for ${phoneNumber}: ${code}`);
  }
}

export class Msg91Sms implements SmsSender {
  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", this.templateId);
    // MSG91 expects the number with country code and no "+".
    url.searchParams.set("mobile", phoneNumber.replace(/^\+/, ""));
    url.searchParams.set("otp", code);
    const res = await this.fetchFn(url, { method: "POST", headers: { authkey: this.authKey } });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type === "error") throw new Error(`MSG91: ${body.message ?? res.status}`);
  }
}
