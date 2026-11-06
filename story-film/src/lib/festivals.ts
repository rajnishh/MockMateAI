// Festival collections for reel recipes (design/community/recipes-spec.md, "Festival collections").
// The owner edits this list each year: lunar dates (Eid, Ramadan, Diwali, Holi) move every year,
// so check them before each season. Dates are calendar days (yyyy-mm-dd), first to last day.
// `featured` holds up to 3 recipe public ids the owner picks ("Picked by Reelkar").

export type FestivalRegion = "in" | "gcc" | "all";

export interface Festival {
  slug: string;
  name: { en: string; hi: string; ar: string };
  region: FestivalRegion;
  // Empty for the all-year collections (Birthday, Wedding, ...).
  dates: [string, string][];
  featured: string[];
}

export const FESTIVALS: Festival[] = [
  { slug: "diwali", name: { en: "Diwali", hi: "दिवाली", ar: "ديوالي" }, region: "in", dates: [["2026-11-08", "2026-11-08"], ["2027-10-29", "2027-10-29"]], featured: [] },
  { slug: "uae-national-day", name: { en: "Eid Al Etihad", hi: "यूएई राष्ट्रीय दिवस", ar: "عيد الاتحاد" }, region: "gcc", dates: [["2026-12-02", "2026-12-03"], ["2027-12-02", "2027-12-03"]], featured: [] },
  { slug: "christmas", name: { en: "Christmas", hi: "क्रिसमस", ar: "عيد الميلاد" }, region: "all", dates: [["2026-12-25", "2026-12-25"], ["2027-12-25", "2027-12-25"]], featured: [] },
  { slug: "new-year", name: { en: "New Year", hi: "नया साल", ar: "رأس السنة" }, region: "all", dates: [["2026-12-31", "2027-01-01"], ["2027-12-31", "2028-01-01"]], featured: [] },
  { slug: "pongal", name: { en: "Pongal", hi: "पोंगल", ar: "بونغال" }, region: "in", dates: [["2027-01-14", "2027-01-17"]], featured: [] },
  { slug: "ramadan", name: { en: "Ramadan", hi: "रमज़ान", ar: "رمضان" }, region: "gcc", dates: [["2027-02-08", "2027-03-09"]], featured: [] },
  // Eid al-Fitr and Eid al-Adha.
  { slug: "eid", name: { en: "Eid", hi: "ईद", ar: "العيد" }, region: "gcc", dates: [["2027-03-10", "2027-03-12"], ["2027-05-16", "2027-05-19"]], featured: [] },
  { slug: "holi", name: { en: "Holi", hi: "होली", ar: "هولي" }, region: "in", dates: [["2027-03-22", "2027-03-22"]], featured: [] },
  { slug: "rakhi", name: { en: "Raksha Bandhan", hi: "रक्षाबंधन", ar: "راخي" }, region: "in", dates: [["2027-08-17", "2027-08-17"]], featured: [] },
  { slug: "onam", name: { en: "Onam", hi: "ओणम", ar: "أونام" }, region: "in", dates: [["2027-09-04", "2027-09-14"]], featured: [] },
  { slug: "ganesh-chaturthi", name: { en: "Ganesh Chaturthi", hi: "गणेश चतुर्थी", ar: "غانيش تشاتورثي" }, region: "in", dates: [["2027-09-04", "2027-09-04"]], featured: [] },
  { slug: "saudi-national-day", name: { en: "Saudi National Day", hi: "सऊदी राष्ट्रीय दिवस", ar: "اليوم الوطني السعودي" }, region: "gcc", dates: [["2027-09-23", "2027-09-23"]], featured: [] },
  { slug: "navratri", name: { en: "Navratri and Durga Puja", hi: "नवरात्रि और दुर्गा पूजा", ar: "نافراتري" }, region: "in", dates: [["2027-09-30", "2027-10-08"]], featured: [] },
  // All year.
  { slug: "birthday", name: { en: "Birthday", hi: "जन्मदिन", ar: "عيد ميلاد" }, region: "all", dates: [], featured: [] },
  { slug: "wedding", name: { en: "Wedding", hi: "शादी", ar: "زفاف" }, region: "all", dates: [], featured: [] },
  { slug: "business", name: { en: "Shop and business", hi: "दुकान और बिज़नेस", ar: "متجر وأعمال" }, region: "all", dates: [], featured: [] },
  { slug: "motivation", name: { en: "Motivation", hi: "मोटिवेशन", ar: "تحفيز" }, region: "all", dates: [], featured: [] },
];

export const FESTIVAL_SLUGS = FESTIVALS.map((f) => f.slug);

// A festival shows on Create and Home from 21 days before its first day to 2 days after its last.
export const WINDOW_BEFORE_DAYS = 21;
export const WINDOW_AFTER_DAYS = 2;
const DAY_MS = 86400_000;

const dayStart = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const today = (now: Date) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

export function findFestival(slug: string): Festival | undefined {
  return FESTIVALS.find((f) => f.slug === slug);
}

// The festival's next (or current) dates: the first range that hasn't ended yet, counting the 2 days after.
export function nextDates(f: Festival, now = new Date()): { first: string; last: string } | null {
  const t = today(now);
  const r = f.dates.find(([, last]) => dayStart(last) + WINDOW_AFTER_DAYS * DAY_MS >= t);
  return r ? { first: r[0], last: r[1] } : null;
}

// Whole days until the festival's first day (0 on the day, negative while it's on or just after).
export function daysUntil(f: Festival, now = new Date()): number | null {
  const d = nextDates(f, now);
  return d ? Math.round((dayStart(d.first) - today(now)) / DAY_MS) : null;
}

export function inWindow(f: Festival, now = new Date()): boolean {
  const d = nextDates(f, now);
  if (!d) return false;
  const t = today(now);
  return t >= dayStart(d.first) - WINDOW_BEFORE_DAYS * DAY_MS && t <= dayStart(d.last) + WINDOW_AFTER_DAYS * DAY_MS;
}

const GULF_ZONES = new Set(["Asia/Dubai", "Asia/Muscat", "Asia/Riyadh", "Asia/Qatar", "Asia/Bahrain", "Asia/Kuwait"]);
const INDIA_ZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

// Whose festivals come first: Arabic or a Gulf time zone puts Gulf ones first, an Indian time zone
// Indian ones. Everyone sees all of them.
export function regionFor(lang?: string | null, tz?: string | null): FestivalRegion {
  if (lang === "ar" || (tz && GULF_ZONES.has(tz))) return "gcc";
  if (tz && INDIA_ZONES.has(tz)) return "in";
  return "all";
}

// The viewer's region first, then the soonest.
export function orderFestivals(list: Festival[], region: FestivalRegion, now = new Date()): Festival[] {
  const rank = (f: Festival) => (region !== "all" && f.region === region ? 0 : 1);
  const soon = (f: Festival) => daysUntil(f, now) ?? Number.MAX_SAFE_INTEGER;
  return [...list].sort((a, b) => rank(a) - rank(b) || soon(a) - soon(b));
}

// Festivals near enough to show on Create and Home, the viewer's region first.
export function nearFestivals(now = new Date(), region: FestivalRegion = "all"): Festival[] {
  return orderFestivals(
    FESTIVALS.filter((f) => inWindow(f, now)),
    region,
    now,
  );
}

// The "Good for" chips when sharing: festivals in the next `days` days first (soonest first),
// then the all-year collections.
export function upcomingFestivals(now = new Date(), days = 60): Festival[] {
  const soon = FESTIVALS.filter((f) => {
    const n = daysUntil(f, now);
    return n !== null && n <= days;
  }).sort((a, b) => (daysUntil(a, now) ?? 0) - (daysUntil(b, now) ?? 0));
  return [...soon, ...FESTIVALS.filter((f) => !f.dates.length)];
}

// Every collection for the gallery's Festivals grid: dated ones by next date, then the all-year ones.
// Festivals with no dates left in the list go last until the owner adds next year's.
export function festivalCalendar(now = new Date(), region: FestivalRegion = "all"): Festival[] {
  const dated = orderFestivals(
    FESTIVALS.filter((f) => nextDates(f, now)),
    region,
    now,
  );
  return [...dated, ...FESTIVALS.filter((f) => !f.dates.length), ...FESTIVALS.filter((f) => f.dates.length && !nextDates(f, now))];
}
