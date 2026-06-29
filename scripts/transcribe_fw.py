#!/usr/bin/env python3
"""faster-whisper transcription wrapper.

Much faster than openai-whisper on CPU (CTranslate2 + int8). Reads a wav path,
prints a JSON object compatible with the app's parser:
  {"language": "...", "segments": [{"start","end","text","words":[{word,start,end}]}]}

Model is loaded from a fixed, world-readable dir baked into the image so it is
never re-downloaded at runtime (works regardless of container user).
"""
import sys
import json

MODEL_ROOT = "/opt/whisper-models"


def main():
    wav = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "tr"
    size = sys.argv[3] if len(sys.argv) > 3 else "base"

    from faster_whisper import WhisperModel

    model = WhisperModel(size, device="cpu", compute_type="int8", download_root=MODEL_ROOT)
    segments, info = model.transcribe(
        wav,
        language=lang,
        word_timestamps=True,
        beam_size=1,  # greedy → faster on CPU
        condition_on_previous_text=False,
    )

    out = {"language": info.language or lang, "segments": []}
    for seg in segments:
        words = []
        for w in (seg.words or []):
            words.append({"word": w.word, "start": float(w.start), "end": float(w.end)})
        out["segments"].append(
            {"start": float(seg.start), "end": float(seg.end), "text": seg.text, "words": words}
        )

    sys.stdout.write(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
