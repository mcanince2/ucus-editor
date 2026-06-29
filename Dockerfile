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

# CPU-only PyTorch + openai-whisper (Türkçe altyazı, ücretsiz/yerel).
# CPU wheels keep the image small enough for a 4 GB VPS.
RUN pip3 install --no-cache-dir --break-system-packages \
      torch --index-url https://download.pytorch.org/whl/cpu \
 && pip3 install --no-cache-dir --break-system-packages openai-whisper

# Pre-download the "base" model so the first subtitle run isn't slow.
# (base is the sweet spot for a 1-vCPU / 4 GB box; "small" is heavier.)
RUN python3 -c "import whisper; whisper.load_model('base')"

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
# Cap build memory so `next build` doesn't OOM on a small VPS.
RUN NODE_OPTIONS=--max-old-space-size=3072 npm run build

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=5190 \
    TRANSCRIBE_PROVIDER=local \
    WHISPER_MODEL=base
EXPOSE 5190
RUN mkdir -p /data

CMD ["npm", "run", "start"]
