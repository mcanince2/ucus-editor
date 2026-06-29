"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, SkipBack, Film, Maximize2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { buildTimeline, clipAtTime, timelineToSource } from "@/lib/timeline";
import { ASPECT_PRESETS } from "@/lib/constants";
import { formatTimecode } from "@/lib/format";
import SubtitleOverlay from "./SubtitleOverlay";
import LogoOverlay from "./LogoOverlay";
import OverlayLayer from "./OverlayLayer";
import AudioLayer from "./AudioLayer";

export default function PreviewPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const clips = useEditor((s) => s.clips);
  const assets = useEditor((s) => s.assets);
  const subtitles = useEditor((s) => s.subtitles);
  const subtitleStyle = useEditor((s) => s.subtitleStyle);
  const logo = useEditor((s) => s.logo);
  const overlays = useEditor((s) => s.overlays);
  const audioTracks = useEditor((s) => s.audioTracks);
  const music = useEditor((s) => s.music);
  const settings = useEditor((s) => s.settings);
  const playing = useEditor((s) => s.playing);
  const seekNonce = useEditor((s) => s.seekNonce);
  const currentTime = useEditor((s) => s.currentTime);
  const setPlaying = useEditor((s) => s.setPlaying);
  const togglePlay = useEditor((s) => s.togglePlay);
  const setCurrentTime = useEditor((s) => s.setCurrentTime);
  const seek = useEditor((s) => s.seek);

  const timeline = useMemo(() => buildTimeline(clips), [clips]);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const assetMapRef = useRef(assetMap);
  assetMapRef.current = assetMap;

  const loadedAssetRef = useRef<string | null>(null);
  const playheadRef = useRef(0); // authoritative timeline time (master clock)
  const lastTsRef = useRef(0);
  const stallRef = useRef(false); // paused while a new source loads
  const rafRef = useRef<number | undefined>(undefined);

  const logoUrl = logo.assetId ? assetMap.get(logo.assetId)?.url : undefined;

  const musicUrl = useMemo(() => {
    if (music.source === "builtin" && music.builtinId) return `/api/music?file=${music.builtinId}`;
    if (music.source === "upload" && music.assetId) return assetMap.get(music.assetId)?.url;
    return undefined;
  }, [music.source, music.builtinId, music.assetId, assetMap]);

  const clampRate = (s: number) => Math.max(0.25, Math.min(4, s || 1));

  /**
   * Make the <video> show the clip at timeline time `t` (load source + seek if
   * the asset changed, otherwise just seek). Used by seeks and clip changes.
   */
  const applyAt = useCallback((t: number, autoplay: boolean) => {
    const v = videoRef.current;
    const tl = timelineRef.current;
    if (!v || !tl.clips.length) return;
    const clip = clipAtTime(tl, t);
    if (!clip) return;
    const asset = assetMapRef.current.get(clip.assetId);
    if (!asset) return;
    const desired = timelineToSource(clip, t);
    if (loadedAssetRef.current !== clip.assetId) {
      loadedAssetRef.current = clip.assetId;
      stallRef.current = true;
      v.src = asset.url;
      let done = false;
      const finish = (seekOk: boolean) => {
        if (done) return;
        done = true;
        v.removeEventListener("loadeddata", onReady);
        v.removeEventListener("canplay", onReady);
        v.removeEventListener("error", onErr);
        clearTimeout(timer);
        if (seekOk) {
          try {
            v.currentTime = Math.max(0, desired);
          } catch {}
          v.muted = clip.muted;
          v.playbackRate = clampRate(clip.speed);
        }
        stallRef.current = false; // ALWAYS release the clock
        if (autoplay && useEditor.getState().playing) v.play().catch(() => {});
      };
      const onReady = () => finish(true);
      const onErr = () => finish(false);
      // Safety net: never let a slow/failed load freeze playback forever.
      const timer = setTimeout(() => finish(true), 4000);
      v.addEventListener("loadeddata", onReady);
      v.addEventListener("canplay", onReady);
      v.addEventListener("error", onErr);
      v.load();
    } else {
      try {
        v.currentTime = desired;
      } catch {}
      v.muted = clip.muted;
      v.playbackRate = clampRate(clip.speed);
      if (autoplay && useEditor.getState().playing) v.play().catch(() => {});
      else if (!autoplay) v.pause();
    }
  }, []);

  const syncMusic = useCallback(() => {
    const m = musicRef.current;
    if (!m) return;
    const st = useEditor.getState();
    if (st.music.source === "none") {
      m.pause();
      return;
    }
    const dur = m.duration || 0;
    const t = st.currentTime;
    const target = dur > 0 ? (st.music.loop ? t % dur : Math.min(t, dur)) : t;
    if (Math.abs(m.currentTime - target) > 0.3) {
      try {
        m.currentTime = target;
      } catch {}
    }
    const ducking = st.music.duck && st.subtitles.some((c) => t >= c.start && t < c.end);
    m.volume = ducking ? Math.min(st.music.volume, st.music.duckAmount) : st.music.volume;
  }, []);

  // Master-clock playback loop: timeline time advances by REAL elapsed time and
  // the <video> is slaved to it (seek only on clip change or drift). This avoids
  // the seek-race freeze that occurred when timeline time was derived from
  // video.currentTime while many short clips switched sources rapidly.
  const tick = useCallback(
    (now: number) => {
      const v = videoRef.current;
      const tl = timelineRef.current;
      if (!v || !tl.clips.length) {
        lastTsRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = lastTsRef.current ? Math.min(0.25, (now - lastTsRef.current) / 1000) : 0;
      lastTsRef.current = now;

      let p = playheadRef.current;
      if (!stallRef.current) p += dt; // hold the clock while a source loads
      if (p >= tl.duration) {
        playheadRef.current = tl.duration;
        setCurrentTime(tl.duration);
        v.pause();
        setPlaying(false);
        syncMusic();
        return; // stop the loop at the end
      }
      playheadRef.current = p;
      setCurrentTime(p);

      const clip = clipAtTime(tl, p);
      if (clip) {
        if (loadedAssetRef.current !== clip.assetId) {
          applyAt(p, true); // switches source + stalls until ready
        } else if (!stallRef.current) {
          const desired = timelineToSource(clip, p);
          if (v.muted !== clip.muted) v.muted = clip.muted;
          const pr = clampRate(clip.speed);
          if (Math.abs(v.playbackRate - pr) > 0.01) v.playbackRate = pr;
          if (v.paused && useEditor.getState().playing) v.play().catch(() => {});
          if (Math.abs(v.currentTime - desired) > 0.2) {
            try {
              v.currentTime = desired;
            } catch {}
          }
        }
      }
      syncMusic();
      rafRef.current = requestAnimationFrame(tick);
    },
    [applyAt, setCurrentTime, setPlaying, syncMusic]
  );

  // Start/stop playback.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      const tl = timelineRef.current;
      if (!tl.clips.length) {
        setPlaying(false);
        return;
      }
      if (playheadRef.current >= tl.duration - 0.05) {
        playheadRef.current = 0;
        setCurrentTime(0);
      }
      lastTsRef.current = 0;
      applyAt(playheadRef.current, true);
      if (musicRef.current && music.source !== "none") musicRef.current.play().catch(() => {});
      rafRef.current = requestAnimationFrame(tick);
    } else {
      v.pause();
      musicRef.current?.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Explicit seeks (timeline clicks / shortcuts) — resync even mid-play.
  useEffect(() => {
    const t = useEditor.getState().currentTime;
    playheadRef.current = t;
    applyAt(t, useEditor.getState().playing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekNonce]);

  // When clips change while paused, refresh the displayed frame.
  useEffect(() => {
    if (!useEditor.getState().playing) {
      const valid = clips.some((c) => c.assetId === loadedAssetRef.current);
      if (!valid) loadedAssetRef.current = null;
      playheadRef.current = useEditor.getState().currentTime;
      applyAt(playheadRef.current, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  // Music element wiring.
  useEffect(() => {
    const m = musicRef.current;
    if (!m) return;
    m.loop = music.loop;
    if (useEditor.getState().playing && music.source !== "none") m.play().catch(() => {});
  }, [musicUrl, music.loop, music.source]);

  // Aspect ratio of the output frame.
  const ratio = useMemo(() => {
    if (settings.aspect === "original") {
      const a = clips[0] && assetMap.get(clips[0].assetId);
      if (a?.width && a?.height) return a.width / a.height;
      return 9 / 16;
    }
    const p = ASPECT_PRESETS[settings.aspect];
    return p.w / p.h;
  }, [settings.aspect, clips, assetMap]);

  // Fit the frame inside the available center area while keeping output ratio.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const availW = el.clientWidth - 8;
      const availH = el.clientHeight - 8;
      if (availW <= 0 || availH <= 0) return;
      let w = availH * ratio;
      let h = availH;
      if (w > availW) {
        w = availW;
        h = availW / ratio;
      }
      setFrameSize({ w: Math.floor(w), h: Math.floor(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [ratio]);

  const hasContent = clips.length > 0;

  const goStart = () => seek(0);

  const enterFullscreen = () => {
    frameRef.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-3">
      <div ref={wrapRef} className="relative flex w-full flex-1 items-center justify-center overflow-hidden">
        <div
          ref={frameRef}
          className="relative overflow-hidden rounded-2xl bg-black shadow-glass ring-1 ring-white/5"
          style={{
            width: frameSize.w || undefined,
            height: frameSize.h || undefined,
            containerType: "size",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            className="absolute inset-0 h-full w-full bg-black object-contain"
          />
          {!hasContent && (
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <Film className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm font-medium text-slate-400">Önizleme burada görünecek</p>
                <p className="mt-1 text-xs text-slate-600">Klip yükleyip otomatik kurguyu çalıştırın</p>
              </div>
            </div>
          )}
          {hasContent &&
            overlays.map((o) => (
              <OverlayLayer key={o.id} overlay={o} url={assetMap.get(o.assetId)?.url} time={currentTime} playing={playing} />
            ))}
          {hasContent && <LogoOverlay logo={logo} url={logoUrl} />}
          {hasContent && <SubtitleOverlay cues={subtitles} style={subtitleStyle} time={currentTime} />}
          <audio ref={musicRef} src={musicUrl} preload="auto" />
          {audioTracks.map((t) => (
            <AudioLayer key={t.id} track={t} url={assetMap.get(t.assetId)?.url} time={currentTime} playing={playing} />
          ))}
        </div>
      </div>

      {/* Transport */}
      <div className="mt-3 flex w-full items-center justify-center gap-3">
        <button onClick={goStart} className="btn-soft h-10 w-10 !px-0" title="Başa dön (Home)">
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={togglePlay}
          disabled={!hasContent}
          className="btn-primary h-12 w-12 !rounded-2xl !px-0"
          title="Oynat / Duraklat (Boşluk)"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <div className="min-w-[120px] rounded-xl bg-black/30 px-3 py-2 text-center font-mono text-xs tabular-nums text-slate-300">
          {formatTimecode(currentTime)} <span className="text-slate-600">/</span>{" "}
          {formatTimecode(timeline.duration)}
        </div>
        <button onClick={enterFullscreen} className="btn-soft h-10 w-10 !px-0" title="Tam ekran">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
