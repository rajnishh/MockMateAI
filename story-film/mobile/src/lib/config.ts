// The Next.js backend (story-film/). Without it the app runs in demo mode with sample data.
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
export const DEMO = !API_URL || process.env.EXPO_PUBLIC_DEMO === "1";
export const SCHEME = "reelkar";

// Studio links; set once the studio name and domain are chosen. Rows hide while empty.
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "";
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? "";
