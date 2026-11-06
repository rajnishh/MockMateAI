// The Next.js backend (story-film/). Without it the app runs in demo mode with sample data.
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
export const DEMO = !API_URL || process.env.EXPO_PUBLIC_DEMO === "1";
export const SCHEME = "reelkar";

// Feedback address; the Send feedback row hides while it is empty.
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "";
// The web app serves /privacy, /terms and /support with no sign-in (App Store listing links).
const WEB = API_URL || "https://reelkar.istari-ai.dev";
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || `${WEB}/privacy`;
export const TERMS_URL = `${WEB}/terms`;
export const SUPPORT_URL = `${WEB}/support`;
