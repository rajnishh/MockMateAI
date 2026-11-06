"use client";

import { useEffect, useRef, useState } from "react";
import type { SongAudio } from "./studio-types";

// Plays the song through one <audio>, with a part-player for Remix and Edit.
export function useSongAudio(src: string | null): SongAudio & { ref: React.RefObject<HTMLAudioElement | null> } {
  const ref = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const time = () => {
      setPosition(a.currentTime);
      if (stopAt.current !== null && a.currentTime >= stopAt.current) {
        stopAt.current = null;
        a.pause();
      }
    };
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    a.addEventListener("timeupdate", time);
    a.addEventListener("play", on);
    a.addEventListener("pause", off);
    a.addEventListener("ended", off);
    return () => {
      a.removeEventListener("timeupdate", time);
      a.removeEventListener("play", on);
      a.removeEventListener("pause", off);
      a.removeEventListener("ended", off);
    };
  }, [src]);

  return {
    ref,
    position,
    playing,
    toggle: () => {
      const a = ref.current;
      if (!a) return;
      stopAt.current = null;
      if (a.paused) void a.play();
      else a.pause();
    },
    seek: (sec) => {
      if (ref.current) ref.current.currentTime = sec;
      setPosition(sec);
    },
    playPart: (start, end) => {
      const a = ref.current;
      if (!a) return;
      a.currentTime = start;
      stopAt.current = end;
      void a.play();
    },
    pause: () => ref.current?.pause(),
  };
}
