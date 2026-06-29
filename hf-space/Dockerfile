# Hugging Face Spaces (Docker SDK) — reuses the prebuilt GHCR image and adapts
# it for HF: HF runs containers as UID 1000 and routes to app_port (7860).
FROM ghcr.io/mcanince2/ucus-editor:latest

USER root
# HF runs as UID 1000 = the node base image's existing `node` user (/home/node).
# Make the data dir + app writable by it. (Whisper model lives in /opt and is
# already world-readable, so no per-user cache copy is needed.)
RUN mkdir -p /data && chown -R 1000:1000 /data /home/node /app

USER 1000
ENV HOME=/home/node \
    NODE_ENV=production \
    DATA_DIR=/data \
    TRANSCRIBE_PROVIDER=local \
    WHISPER_MODEL=base \
    HF_HUB_OFFLINE=1 \
    PORT=7860
WORKDIR /app
EXPOSE 7860
# Bind 0.0.0.0 so HF's proxy can reach it.
CMD ["sh", "-c", "node_modules/.bin/next start -p ${PORT:-7860} -H 0.0.0.0"]
