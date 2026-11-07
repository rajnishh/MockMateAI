// Festival chips (design/v3.0/quick-create.md 2): which festivals are near, by where you are and the calendar.
// Where: the phone's time zone gives the country; an Indian app language also shows Indian festivals
// (Indians in the Gulf). When: a chip shows from LEAD_DAYS before a festival until its last day.
// Islamic dates follow the moon and can move by a day. Extend the table before June 2027.

export type Region = "IN" | "AE" | "SA" | "QA" | "KW" | "BH" | "OM" | "other";
const GCC: Region[] = ["AE", "SA", "QA", "KW", "BH", "OM"];

export interface Festival {
  id: string;
  name: string;
  // First and last day, local dates.
  from: string;
  to: string;
  // "IN", "GCC", "ALL" or one country.
  where: (Region | "GCC" | "ALL")[];
  // Prefills the story maker.
  idea: string;
}

export const LEAD_DAYS = 10;

export const FESTIVALS: Festival[] = [
  { id: "diwali-2026", name: "Diwali", from: "2026-11-06", to: "2026-11-11", where: ["IN"], idea: "A Diwali reel: diyas, rangoli, sweets and family, ending with a warm Happy Diwali wish" },
  { id: "chhath-2026", name: "Chhath", from: "2026-11-14", to: "2026-11-16", where: ["IN"], idea: "A Chhath Puja reel: sunrise at the ghat, offerings to the sun, and a heartfelt wish" },
  { id: "gurpurab-2026", name: "Guru Nanak Jayanti", from: "2026-11-24", to: "2026-11-24", where: ["IN"], idea: "A Gurpurab reel: the gurdwara lit up, langar and seva, with a peaceful wish" },
  { id: "uae-national-2026", name: "UAE National Day", from: "2026-12-01", to: "2026-12-03", where: ["AE"], idea: "A UAE National Day reel: flags, the skyline lit in red, green, white and black, and pride in the Union" },
  { id: "qatar-national-2026", name: "Qatar National Day", from: "2026-12-18", to: "2026-12-18", where: ["QA"], idea: "A Qatar National Day reel: maroon and white, the Corniche, and pride in Qatar" },
  { id: "christmas-2026", name: "Christmas", from: "2026-12-24", to: "2026-12-25", where: ["ALL"], idea: "A Christmas reel: lights, cake, a little Santa surprise and a warm Merry Christmas" },
  { id: "new-year-2027", name: "New Year", from: "2026-12-31", to: "2027-01-01", where: ["ALL"], idea: "A New Year reel: my year in moments, a countdown and a big Happy New Year wish" },
  { id: "lohri-2027", name: "Lohri", from: "2027-01-13", to: "2027-01-13", where: ["IN"], idea: "A Lohri reel: the bonfire, dhol, gajak and revdi, and a Happy Lohri wish" },
  { id: "pongal-2027", name: "Pongal and Sankranti", from: "2027-01-14", to: "2027-01-17", where: ["IN"], idea: "A Pongal and Makar Sankranti reel: kites, kolam, sweet pongal and a harvest wish" },
  { id: "republic-2027", name: "Republic Day", from: "2027-01-26", to: "2027-01-26", where: ["IN"], idea: "A Republic Day reel: the tiranga, the parade and pride in India" },
  { id: "ramadan-2027", name: "Ramadan", from: "2027-02-08", to: "2027-03-09", where: ["GCC", "IN"], idea: "A Ramadan nights reel: lanterns, iftar with family and a Ramadan Kareem wish" },
  { id: "saudi-founding-2027", name: "Founding Day", from: "2027-02-22", to: "2027-02-22", where: ["SA"], idea: "A Saudi Founding Day reel: heritage dress, Diriyah and pride in the Kingdom" },
  { id: "eid-fitr-2027", name: "Eid al-Fitr", from: "2027-03-10", to: "2027-03-12", where: ["GCC", "IN"], idea: "An Eid al-Fitr reel: new clothes, sweets, eidi for the kids and an Eid Mubarak wish" },
  { id: "holi-2027", name: "Holi", from: "2027-03-21", to: "2027-03-22", where: ["IN"], idea: "A Holi reel: colours everywhere, gujiya, music and a Happy Holi wish" },
  { id: "eid-adha-2027", name: "Eid al-Adha", from: "2027-05-16", to: "2027-05-19", where: ["GCC", "IN"], idea: "An Eid al-Adha reel: prayers, family feasts, giving and an Eid Mubarak wish" },
];

const ZONES: Record<string, Region> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Asia/Kuwait": "KW",
  "Asia/Bahrain": "BH",
  "Asia/Muscat": "OM",
};
const INDIAN_LANGUAGES = ["hi", "mr", "bn", "ta", "te", "kn", "ml", "gu", "pa"];

export function regionNow(): Region {
  try {
    return ZONES[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? "other";
  } catch {
    return "other";
  }
}

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

// The nearest festival for this person today, or null. Pure, so it's easy to test.
export function festivalNear(now: Date, region: Region, language: string | undefined): Festival | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lead = LEAD_DAYS * 86400000;
  const fits = (f: Festival) =>
    f.where.some((w) => w === "ALL" || w === region || (w === "GCC" && GCC.includes(region)) || (w === "IN" && INDIAN_LANGUAGES.includes(language ?? "")));
  return FESTIVALS.filter((f) => fits(f) && today >= day(f.from) - lead && today <= day(f.to)).sort((a, b) => day(a.from) - day(b.from))[0] ?? null;
}
