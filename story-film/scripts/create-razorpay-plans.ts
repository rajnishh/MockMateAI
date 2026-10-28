// Creates the monthly plans in Razorpay (once per account / mode) and prints
// the env lines to paste into .env. Run: npm run billing:plans
import { PLANS, planEnvName, type Currency } from "@/lib/billing/catalog";
import { razorpayFromEnv } from "@/lib/billing/config";
import { loadEnv } from "@/lib/env";

const rzp = razorpayFromEnv(loadEnv());
if (!rzp) throw new Error("Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET first");

for (const plan of PLANS) {
  for (const currency of ["INR", "USD"] as Currency[]) {
    try {
      const created = await rzp.createPlan({ name: `${plan.name} (${plan.credits} credits)`, amount: plan.price[currency], currency });
      console.log(`${planEnvName(plan, currency)}=${created.id}`);
    } catch (err) {
      // USD plans need International Payments enabled on the Razorpay account.
      console.error(`# ${plan.id} ${currency}: ${(err as Error).message}`);
    }
  }
}
