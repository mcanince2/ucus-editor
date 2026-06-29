# ─────────────────────────────────────────────────────────────
# Uçuş Saati Studio — production image with FFmpeg + local Whisper.
# Recommended deployment (Hostinger VPS / Railway / Render / Fly):
# a real long-running Node server → no serverless timeouts, no lost uploads.
# ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

# System deps: FFmpeg (render) + Python (local Whisper ASR).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# faster-whisper (CTranslate2 + int8): ~5-8x faster than openai-whisper on CPU,
# loads in ~1-2s, no PyTorch → smaller image, dramatically faster transcription.
RUN pip3 install --no-cache-dir --break-system-packages faster-whisper

# Bake the base model into a fixed, world-readable dir so it is NEVER
# re-downloaded at runtime (works under any container user, e.g. HF UID 1000).
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8', download_root='/opt/whisper-models')" \
 && chmod -R a+rX /opt/whisper-models

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
# Cap build memory so `next build` doesn't OOM on a small VPS.
RUN NODE_OPTIONS=--max-old-space-size=3072 npm run build

# Fonts for libass (subtitle burn) + drawtext (intro/outro). REQUIRED — without
# a fontconfig font, export FAILS when subtitles are present. Placed late so the
# cached torch/npm/build layers above are reused (fast rebuilds). Fira Sans for
# brand accuracy; falls back to DejaVu if the download fails.
RUN apt-get update && apt-get install -y --no-install-recommends \
      fontconfig fonts-dejavu-core curl \
 && mkdir -p /usr/share/fonts/truetype/firasans \
 && for w in Regular Medium SemiBold Bold; do \
      curl -fsSL -o /usr/share/fonts/truetype/firasans/FiraSans-$w.ttf \
        "https://github.com/mozilla/Fira/raw/master/ttf/FiraSans-$w.ttf" || true; \
    done \
 && fc-cache -f >/dev/null 2>&1 || true \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=5190 \
    TRANSCRIBE_PROVIDER=local \
    WHISPER_MODEL=base \
    HF_HUB_OFFLINE=1
EXPOSE 5190
RUN mkdir -p /data

CMD ["npm", "run", "start"]
