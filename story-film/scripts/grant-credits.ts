// Gives an account credits once, e.g. App Review's demo account (docs/PLAN.md item 48).
//   npm run credits:grant -- review@reelkar.app 200 app-review-1
// The last argument names the grant; running it again with the same name adds nothing.
import { eq } from "drizzle-orm";
import { grantCredits } from "../src/lib/billing/credits";
import { getDb } from "../src/lib/db";
import { user } from "../src/lib/db/schema";

const [email, amount, name] = process.argv.slice(2);
const credits = Number(amount);
if (!email || !Number.isInteger(credits) || credits <= 0 || !name) {
  console.error("Usage: npm run credits:grant -- <email> <credits> <grant name>");
  process.exit(1);
}

const db = getDb();
const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase()));
if (!u) {
  console.error(`No account for ${email}. Sign in with it once first.`);
  process.exit(1);
}
const added = await grantCredits(db, u.id, credits, "grant", `manual:${name}`);
console.log(added ? `Added ${credits} credits to ${email}.` : `Grant "${name}" was already given; nothing added.`);
process.exit(0);
