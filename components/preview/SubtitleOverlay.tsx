"use client";

import { useMemo } from "react";
import type { SubtitleCue, SubtitleStyle } from "@/lib/types";
import { wrapText, keywordIndex, activeWordIndex } from "@/lib/subtitles";

function rgba(hex: string, a: number) {
  const h = hex.replace("#", "").padEnd(6, "0");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default function SubtitleOverlay({
  cues,
  style,
  time,
}: {
  cues: SubtitleCue[];
  style: SubtitleStyle;
  time: number;
}) {
  const active = useMemo(() => cues.find((c) => time >= c.start && time < c.end) || null, [cues, time]);
  if (!active) return null;

  const text = style.uppercase ? active.text.toLocaleUpperCase("tr-TR") : active.text;
  const fontSizeCqh = (style.fontSize / 1080) * 100;
  const lines = wrapText(text, style.maxCharsPerLine);
  const awi = activeWordIndex(active, time);

  // Flatten active-word index across wrapped lines (for tiktok karaoke).
  let wordCursor = 0;

  const textShadow =
    style.shadow > 0
      ? `0 ${(style.shadow / 1080) * 100}cqh ${(style.shadow / 540) * 100}cqh rgba(0,0,0,0.85)`
      : style.boxOpacity > 0
      ? "none"
      : "0 2px 6px rgba(0,0,0,0.7)";

  const stroke =
    style.outlineWidth > 0 && style.boxOpacity === 0
      ? { WebkitTextStroke: `${(style.outlineWidth / 1080) * 100}cqh ${style.outlineColor}` }
      : {};

  return (
    <div
      className="pointer-events-none absolute left-1/2 z-20 flex w-[92%] -translate-x-1/2 flex-col items-center"
      style={{ top: `${style.positionY * 100}%`, transform: "translate(-50%,-50%)" }}
    >
      {lines.map((line, li) => {
        const words = line.split(" ");
        const ki = style.preset === "keyword" ? keywordIndex(words) : -1;
        const lineStartWord = wordCursor;
        wordCursor += words.length;
        return (
          <span
            key={li}
            className="max-w-full text-center font-bold leading-tight"
            style={{
              fontFamily: style.fontFamily,
              fontSize: `${fontSizeCqh}cqh`,
              fontWeight: style.bold ? 800 : 400,
              color: style.primaryColor,
              textShadow,
              background: style.boxOpacity > 0 ? rgba(style.boxColor, style.boxOpacity) : "transparent",
              padding: style.boxOpacity > 0 ? "0.08em 0.4em" : 0,
              borderRadius: style.boxOpacity > 0 ? "0.18em" : 0,
              marginTop: li === 0 ? 0 : "0.12em",
              ...stroke,
            }}
          >
            {words.map((w, wi) => {
              const globalIdx = lineStartWord + wi;
              const isKeyword = wi === ki;
              const isActiveWord = style.preset === "tiktok" && awi === globalIdx;
              const hl = isKeyword || isActiveWord;
              return (
                <span key={wi} style={hl ? { color: style.highlightColor, fontWeight: 800 } : undefined}>
                  {w}
                  {wi < words.length - 1 ? " " : ""}
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}
