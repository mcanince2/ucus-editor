/** @type {import('next').NextConfig} */
const ffmpegTrace = ["./node_modules/ffmpeg-static/**", "./node_modules/ffprobe-static/**"];

const nextConfig = {
  // Allow building to an alternate dir (so a running dev server isn't disturbed).
  distDir: process.env.NEXT_DIST || ".next",
  reactStrictMode: false,
  experimental: {
    // Mark the static-binary packages external so webpack doesn't try to bundle
    // their native binaries (keeps them resolvable via node_modules at runtime).
    serverComponentsExternalPackages: ["ffmpeg-static", "ffprobe-static"],
    // Allow large request bodies for raw file uploads streamed to disk.
    serverActions: {
      bodySizeLimit: "2gb",
    },
    // Ensure the ffmpeg/ffprobe binaries are traced into serverless functions.
    outputFileTracingIncludes: {
      "/api/export": ffmpegTrace,
      "/api/transcribe": ffmpegTrace,
      "/api/silence": ffmpegTrace,
      "/api/music": ffmpegTrace,
      "/api/upload": ffmpegTrace,
      "/api/brand-music": ffmpegTrace,
      "/api/brand-logo": ffmpegTrace,
    },
  },
};

module.exports = nextConfig;
