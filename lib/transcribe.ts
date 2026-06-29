import fs from "node:fs";
import path from "node:path";
import { run, FFMPEG } from "./ffmpeg";
import { freshTmp, TMP_DIR, ensureDirs } from "./storage";
import type { TranscriptResult, WordTiming } from "./types";

export const WHISPER = process.env.WHISPER_PATH || "whisper";
export const WHISPER_MODEL = process.env.WHISPER_MODEL || "small";
export const PROVIDER = (process.env.TRANSCRIBE_PROVIDER || "auto").toLowerCase();

export async function whisperLocalAvailable(): Promise<boolean> {
  try {
    const r = await run(WHISPER, ["--help"]);
    return r.code === 0;
  } catch {
    return false;
  }
}

export function openaiAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Decide which provider to actually use given env + availability. */
export async function resolveProvider(): Promise<"local" | "openai" | null> {
  if (PROVIDER === "local") return (await whisperLocalAvailable()) ? "local" : null;
  if (PROVIDER === "openai") return openaiAvailable() ? "openai" : null;
  // auto
  if (await whisperLocalAvailable()) return "local";
  if (openaiAvailable()) return "openai";
  return null;
}

/** Extract a clean 16k mono WAV for ASR. */
async function extractWav(input: string): Promise<string> {
  ensureDirs();
  const out = freshTmp(".wav");
  const r = await run(FFMPEG, ["-y", "-i", input, "-ac", "1", "-ar", "16000", "-vn", out]);
  if (r.code !== 0 || !fs.existsSync(out)) {
    throw new Error("Ses çıkarılamadı (ffmpeg): " + r.stderr.slice(-300));
  }
  return out;
}

function cleanText(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Local transcription. Prefers faster-whisper (CTranslate2, ~5-8x faster on
 * CPU, no torch) via a Python wrapper; falls back to the openai-whisper CLI
 * (e.g. local dev machines that only have that installed).
 */
async function transcribeLocal(input: string): Promise<TranscriptResult> {
  const wav = await extractWav(input);
  const fw = await tryFasterWhisper(wav);
  if (fw) return fw;
  return await transcribeWhisperCli(wav);
}

const PYTHON = process.env.PYTHON_PATH || "python3";

/** Run the faster-whisper wrapper; returns null if unavailable/failed. */
async function tryFasterWhisper(wav: string): Promise<TranscriptResult | null> {
  const script = path.join(process.cwd(), "scripts", "transcribe_fw.py");
  if (!fs.existsSync(script)) return null;
  const r = await run(PYTHON, [script, wav, "tr", WHISPER_MODEL]);
  const text = r.stdout.trim();
  if (r.code !== 0 || !text) return null;
  try {
    const line = text.split("\n").filter(Boolean).pop() || "";
    const data = JSON.parse(line);
    if (!Array.isArray(data.segments)) return null;
    return parseWhisperJson(data);
  } catch {
    return null;
  }
}

/** Fallback: openai-whisper CLI. */
async function transcribeWhisperCli(wav: string): Promise<TranscriptResult> {
  const outDir = path.join(TMP_DIR, `whisper_${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const args = [
    wav,
    "--language",
    "Turkish",
    "--task",
    "transcribe",
    "--model",
    WHISPER_MODEL,
    "--output_format",
    "json",
    "--output_dir",
    outDir,
    "--word_timestamps",
    "True",
    "--fp16",
    "False",
    "--verbose",
    "False",
  ];
  const r = await run(WHISPER, args);
  if (r.code !== 0) {
    throw new Error("Whisper hatası: " + (r.stderr || r.stdout).slice(-400));
  }
  const base = path.basename(wav, ".wav");
  const jsonPath = path.join(outDir, `${base}.json`);
  if (!fs.existsSync(jsonPath)) {
    // whisper may name by full basename; pick the first json in dir
    const found = fs.readdirSync(outDir).find((f) => f.endsWith(".json"));
    if (!found) throw new Error("Whisper çıktısı bulunamadı.");
    return parseWhisperJson(JSON.parse(fs.readFileSync(path.join(outDir, found), "utf8")));
  }
  return parseWhisperJson(JSON.parse(fs.readFileSync(jsonPath, "utf8")));
}

function parseWhisperJson(data: any): TranscriptResult {
  const cues = (data.segments || [])
    .map((seg: any) => {
      const words: WordTiming[] | undefined = Array.isArray(seg.words)
        ? seg.words
            .filter((w: any) => w.word != null)
            .map((w: any) => ({
              word: cleanText(String(w.word)),
              start: w.start ?? seg.start,
              end: w.end ?? seg.end,
            }))
        : undefined;
      return {
        start: seg.start ?? 0,
        end: seg.end ?? (seg.start ?? 0) + 2,
        text: cleanText(seg.text || ""),
        words,
      };
    })
    .filter((c: any) => c.text.length > 0);
  return { cues, language: data.language || "tr" };
}

/** Transcription via OpenAI Whisper API. */
async function transcribeOpenAI(input: string): Promise<TranscriptResult> {
  const wav = await extractWav(input);
  const key = process.env.OPENAI_API_KEY!;
  const buf = fs.readFileSync(wav);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "audio/wav" }), "audio.wav");
  form.append("model", "whisper-1");
  form.append("language", "tr");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("timestamp_granularities[]", "word");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form as any,
  });
  if (!res.ok) {
    throw new Error("OpenAI Whisper hatası: " + (await res.text()).slice(0, 300));
  }
  const data = await res.json();
  // verbose_json gives segments[] and (optionally) words[]
  const cues = (data.segments || []).map((seg: any) => ({
    start: seg.start,
    end: seg.end,
    text: cleanText(seg.text || ""),
  }));
  return { cues, language: data.language || "tr" };
}

export async function transcribe(input: string): Promise<TranscriptResult> {
  const provider = await resolveProvider();
  if (!provider) {
    throw new Error(
      "Konuşma tanıma için sağlayıcı bulunamadı. Yerel `whisper` kurun veya OPENAI_API_KEY ekleyin."
    );
  }
  return provider === "local" ? transcribeLocal(input) : transcribeOpenAI(input);
}
