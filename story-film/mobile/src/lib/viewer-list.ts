import type { Film } from "./api";

// The reels the viewer pages through: the list it was opened from (Home's rail, My reels). Set
// just before pushing /watch/[id]; a deep link with no list opens your ready reels.
let films: Film[] | null = null;

export const viewerList = {
  set: (list: Film[]) => {
    films = list.filter((f) => f.status === "completed" && f.videoUrl);
  },
  get: () => films,
  clear: () => {
    films = null;
  },
};
