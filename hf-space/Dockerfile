# Hugging Face Spaces (Docker SDK) — reuses the prebuilt GHCR image and adapts
# it for HF: HF runs containers as UID 1000 and routes to app_port (7860).
# Pinned to a specific digest because HF caches the `:latest` tag and won't
# re-pull a new push. Re-pin on each deploy (or query the latest digest).
FROM ghcr.io/mcanince2/ucus-editor@sha256:4fee9c76c02f07c5b002b5cb35a9768d8d4b982649b431581562de832c93d242

USER root
# Bake the licensed default music into the image (shipped only here, not in the
# public Git repo). /api/brand-music serves it from /app/public → the seed picks
# it as the default track.
COPY brand-music.mp3 /app/public/brand-music.mp3
# HF runs as UID 1000 = the node base image's existing `node` user (/home/node).
# Make the data dir + app writable by it. (Whisper model lives in /opt and is
# already world-readable, so no per-user cache copy is needed.)
RUN mkdir -p /data && chown -R 1000:1000 /data /home/node /app

USER 1000
ENV HOME=/home/node \
    NODE_ENV=production \
    DATA_DIR=/data \
    TRANSCRIBE_PROVIDER=local \
    WHISPER_MODEL=small \
    HF_HUB_OFFLINE=1 \
    PORT=7860
WORKDIR /app
EXPOSE 7860
# Bind 0.0.0.0 so HF's proxy can reach it.
CMD ["sh", "-c", "node_modules/.bin/next start -p ${PORT:-7860} -H 0.0.0.0"]
