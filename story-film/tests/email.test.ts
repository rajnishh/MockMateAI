import { describe, expect, it } from "vitest";
import { ResendEmail } from "@/lib/email";

describe("ResendEmail", () => {
  it("sends the code to Resend from the configured sender", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    }) as unknown as typeof fetch;

    await new ResendEmail("re_test", "Reelkar <login@reelkar.test>", fetchFn).sendOtp("creator@example.ae", "123456");

    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ from: "Reelkar <login@reelkar.test>", to: ["creator@example.ae"], subject: "123456 is your Reelkar code" });
    expect(body.text).toContain("123456");
  });

  it("throws Resend's message when sending fails", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 })) as unknown as typeof fetch;
    await expect(new ResendEmail("re_test", "x@y.test", fetchFn).sendOtp("a@b.test", "1")).rejects.toThrow("Resend: Domain not verified");
  });
});
