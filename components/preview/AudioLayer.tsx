"use client";

import { useEffect, useRef } from "react";
import type { AudioTrack } from "@/lib/types";

export default function AudioLayer({
  track,
  url,
  time,
  playing,
}: {
  track: AudioTrack;
  url?: string;
  time: number;
  playing: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const local = time - track.start;
    if (local >= 0) {
      if (Math.abs(a.currentTime - local) > 0.3) {
        try {
          a.currentTime = Math.max(0, local);
        } catch {}
      }
      a.volume = track.volume;
      if (playing && a.paused) a.play().catch(() => {});
      if (!playing && !a.paused) a.pause();
    } else if (!a.paused) {
      a.pause();
    }
  }, [time, playing, track.start, track.volume]);

  if (!url) return null;
  return <audio ref={ref} src={url} preload="auto" />;
}
