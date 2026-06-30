import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureDirs } from "./storage";
import { SERIES_PRESETS } from "./constants";
import type { SeriesType } from "./types";

// Persistent per-series export counters. Stored as a small JSON file in the
// data dir so numbering survives restarts (and lives on the HF Space volume).
const COUNTER_FILE = path.join(DATA_DIR, "series-counters.json");

function readCounters(): Record<string, number> {
  try {
    const raw = fs.readFileSync(COUNTER_FILE, "utf8");
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function writeCounters(c: Record<string, number>) {
  ensureDirs();
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(c, null, 2), "utf8");
  } catch {}
}

/** Bump the counter for a series and return the new value (starts at 1). */
export function nextCount(series: SeriesType): number {
  const c = readCounters();
  const n = (c[series] || 0) + 1;
  c[series] = n;
  writeCounters(c);
  return n;
}

/** Current counter without incrementing (for previews). */
export function peekCount(series: SeriesType): number {
  return readCounters()[series] || 0;
}

/** Build the auto export file name, e.g. "Minik_Pilotlarla_Roportaj_3". */
export function seriesFileName(series: SeriesType, n: number): string {
  const base = SERIES_PRESETS[series]?.fileBase || "Ucus_Saati";
  return `${base}_${n}`;
}
