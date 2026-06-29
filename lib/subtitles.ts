import type { SubtitleCue, SubtitleStyle, WordTiming } from "./types";
import { assTime } from "./format";

/** Convert #rrggbb + opacity(0..1) to ASS &HAABBGGRR (AA: 00=opaque). */
export function hexToAss(hex: string, opacity = 1): string {
  const h = hex.replace("#", "").padEnd(6, "0");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  const a = Math.round((1 - clamp01(opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** Word-wrap a string to a max chars-per-line, returning lines. */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Pick the "keyword" to highlight in a line (longest meaningful word). */
export function keywordIndex(words: string[]): number {
  let best = -1;
  let bestLen = 3;
  words.forEach((w, i) => {
    const clean = w.replace(/[^\wçğıöşüÇĞİÖŞÜ]/g, "");
    if (clean.length > bestLen) {
      bestLen = clean.length;
      best = i;
    }
  });
  return best;
}

function escapeAss(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, " ");
}

/**
 * Which word index in a cue is "active" at the given timeline time.
 * Used by both the preview overlay and (conceptually) export highlighting.
 */
export function activeWordIndex(cue: SubtitleCue, time: number): number {
  if (!cue.words || !cue.words.length) return -1;
  for (let i = 0; i < cue.words.length; i++) {
    if (time >= cue.words[i].start && time < cue.words[i].end) return i;
  }
  if (time >= cue.words[cue.words.length - 1].end) return cue.words.length - 1;
  return -1;
}

interface AssOpts {
  width: number;
  height: number;
}

/** Build a full .ass subtitle file for burning into the export. */
export function buildAss(cues: SubtitleCue[], style: SubtitleStyle, opts: AssOpts): string {
  const { width, height } = opts;
  const scale = height / 1080;
  const fontSize = Math.round(style.fontSize * scale);
  const outline = style.boxOpacity > 0 ? Math.round(12 * scale) : Math.round(style.outlineWidth * scale);
  const shadow = Math.round(style.shadow * scale);
  const borderStyle = style.boxOpacity > 0 ? 3 : 1;

  const primary = hexToAss(style.primaryColor, 1);
  const outlineCol = style.boxOpacity > 0 ? hexToAss(style.boxColor, style.boxOpacity) : hexToAss(style.outlineColor, 1);
  const backCol = hexToAss(style.boxColor, style.boxOpacity > 0 ? style.boxOpacity : 0.6);

  const marginV = Math.round((1 - style.positionY) * height);
  const bold = style.bold ? -1 : 0;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,${style.fontFamily},${fontSize},${primary},${primary},${outlineCol},${backCol},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},2,80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events: string[] = [];
  const highlight = hexToAss(style.highlightColor, 1);
  const usesWordHighlight = style.preset === "tiktok" || style.preset === "keyword";

  for (const cue of cues) {
    if (cue.end <= cue.start) continue;
    const text = style.uppercase ? cue.text.toLocaleUpperCase("tr-TR") : cue.text;

    if (usesWordHighlight && cue.words && cue.words.length > 1 && style.preset === "tiktok") {
      // Karaoke-style: emit one event per word window with that word highlighted.
      const ws = cue.words;
      const display = ws.map((w) => (style.uppercase ? w.word.toLocaleUpperCase("tr-TR") : w.word));
      for (let i = 0; i < ws.length; i++) {
        const start = Math.max(cue.start, ws[i].start);
        const end = i + 1 < ws.length ? Math.max(start + 0.05, ws[i + 1].start) : cue.end;
        const lineText = display
          .map((w, j) => (j === i ? `{\\c${highlight}}${escapeAss(w)}{\\c${primary}}` : escapeAss(w)))
          .join(" ");
        events.push(dialogue(start, end, lineText));
      }
    } else if (style.preset === "keyword") {
      // Highlight the strongest word per line, static for the cue duration.
      const lines = wrapText(text, style.maxCharsPerLine);
      const rendered = lines
        .map((line) => {
          const words = line.split(" ");
          const ki = keywordIndex(words);
          return words
            .map((w, i) => (i === ki ? `{\\c${highlight}}${escapeAss(w)}{\\c${primary}}` : escapeAss(w)))
            .join(" ");
        })
        .join("\\N");
      events.push(dialogue(cue.start, cue.end, rendered));
    } else {
      const lines = wrapText(text, style.maxCharsPerLine).map(escapeAss).join("\\N");
      events.push(dialogue(cue.start, cue.end, lines));
    }
  }

  function dialogue(start: number, end: number, txt: string): string {
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Main,,0,0,0,,${txt}`;
  }

  return `${header}\n${events.join("\n")}\n`;
}

/** Merge raw transcript cues into nicely sized subtitle lines. */
export function cuesFromTranscript(
  raw: { start: number; end: number; text: string; words?: WordTiming[] }[],
  maxChars = 42
): SubtitleCue[] {
  const out: SubtitleCue[] = [];
  let idx = 0;
  for (const seg of raw) {
    const text = seg.text.trim();
    if (!text) continue;
    out.push({
      id: `cue_${idx++}_${Math.round(seg.start * 100)}`,
      start: seg.start,
      end: Math.max(seg.start + 0.4, seg.end),
      text,
      words: seg.words,
    });
  }
  return out;
}
