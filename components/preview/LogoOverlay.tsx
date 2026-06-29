"use client";

import type { LogoState } from "@/lib/types";

export default function LogoOverlay({ logo, url }: { logo: LogoState; url?: string }) {
  if (!url || !logo.assetId) return null;

  const widthPct = logo.scale * 100;
  const marginPct = logo.margin * 100;

  let style: React.CSSProperties = {
    position: "absolute",
    width: `${widthPct}%`,
    opacity: logo.opacity,
    zIndex: 25,
    pointerEvents: "none",
    filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.35))",
  };

  switch (logo.position) {
    case "tl":
      style = { ...style, top: `${marginPct}%`, left: `${marginPct}%` };
      break;
    case "tr":
      style = { ...style, top: `${marginPct}%`, right: `${marginPct}%` };
      break;
    case "bl":
      style = { ...style, bottom: `${marginPct}%`, left: `${marginPct}%` };
      break;
    case "br":
      style = { ...style, bottom: `${marginPct}%`, right: `${marginPct}%` };
      break;
    case "center":
      style = { ...style, left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
      break;
    case "custom":
      style = {
        ...style,
        left: `${logo.x * 100}%`,
        top: `${logo.y * 100}%`,
        transform: "translate(-50%,-50%)",
      };
      break;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="logo" style={style} />;
}
