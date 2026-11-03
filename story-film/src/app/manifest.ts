import type { MetadataRoute } from "next";

// Makes the web app installable on Android ("Add to home screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Story to Film",
    short_name: "StoryFilm",
    description: "Make reels, cartoons and short films with AI.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff7ee",
    theme_color: "#ff7a1a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
