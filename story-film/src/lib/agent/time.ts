// Dates in the creator's own time zone ("tomorrow 7:30 pm" means their evening), without a library.

export function validTimeZone(tz: string | undefined): string {
  if (!tz) return "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "Asia/Kolkata";
  }
}

function parts(date: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "long" })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return p as Record<"year" | "month" | "day" | "hour" | "minute" | "second" | "weekday", string>;
}

// The creator's local date ("2026-10-31"), time ("19:05") and weekday right now.
export function localNow(now: Date, tz: string): { date: string; time: string; weekday: string } {
  const p = parts(now, tz);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: p.weekday };
}

// How far the zone is ahead of UTC at that moment, in milliseconds.
function offsetAt(t: number, tz: string): number {
  const p = parts(new Date(t), tz);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

// A local date and time in the zone, as an instant. Checked twice to land right around clock changes.
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetAt(guess, tz);
  const again = guess - offsetAt(t, tz);
  if (again !== t) t = again;
  return new Date(t);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Evening is when most Indian creators' audiences scroll; a later version learns each account's best time.
export const DEFAULT_POST_TIME = "19:30";

// The next time slot at least 10 minutes away: today if it's still ahead, else tomorrow.
export function nextSlot(now: Date, tz: string, time = DEFAULT_POST_TIME): Date {
  const today = localNow(now, tz).date;
  const at = zonedToUtc(today, time, tz);
  return at.getTime() > now.getTime() + 10 * 60_000 ? at : zonedToUtc(addDays(today, 1), time, tz);
}

// "Fri 31 Oct, 7:30 pm" in the creator's zone.
export function formatWhen(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(at);
}
