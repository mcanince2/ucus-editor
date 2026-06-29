"use client";

import { useEffect, useRef } from "react";
import type { Overlay } from "@/lib/types";

export default function OverlayLayer({
  overlay,
  url,
  time,
  playing,
}: {
  overlay: Overlay;
  url?: string;
  time: number;
  playing: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const active = time >= overlay.start && time < overlay.start + overlay.duration;

  useEffect(() => {
    if (overlay.kind !== "video") return;
    const v = ref.current;
    if (!v) return;
    const local = time - overlay.start;
    if (active) {
      if (local >= 0 && Math.abs(v.currentTime - local) > 0.3) {
        try {
          v.currentTime = Math.max(0, local);
        } catch {}
      }
      if (playing && v.paused) v.play().catch(() => {});
      if (!playing && !v.paused) v.pause();
    } else if (!v.paused) {
      v.pause();
    }
  }, [time, playing, active, overlay.kind, overlay.start]);

  if (!url) return null;

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${overlay.x * 100}%`,
    top: `${overlay.y * 100}%`,
    width: `${overlay.scale * 100}%`,
    transform: "translate(-50%,-50%)",
    opacity: active ? overlay.opacity : 0,
    zIndex: 15,
    pointerEvents: "none",
    transition: "opacity 0.15s",
    borderRadius: "6px",
    overflow: "hidden",
  };

  if (overlay.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} />;
  }
  return <video ref={ref} src={url} muted={overlay.muted} playsInline style={style} />;
}
