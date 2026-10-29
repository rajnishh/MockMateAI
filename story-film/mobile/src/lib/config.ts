// The Next.js backend (story-film/). Without it the app runs in demo mode with sample data.
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
export const DEMO = !API_URL || process.env.EXPO_PUBLIC_DEMO === "1";
export const SCHEME = "reelkar";
