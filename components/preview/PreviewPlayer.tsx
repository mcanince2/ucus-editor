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
  // Two stacked <video> elements (double buffer): the visible one keeps showing
  // its frame while the next clip's source loads on the hidden one, then we swap
  // instantly → no black flash on clip/source transitions.
  const vA = useRef<HTMLVideoElement>(null);
  const vB = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  const playheadRef = useRef(0);
  const lastTsRef = useRef(0);
  const stallRef = useRef(false);
  const rafRef = useRef<number | undefined>(undefined);

  const [frontIdx, setFrontIdx] = useState(0);
  const frontIdxRef = useRef(0);
  const loadedA = useRef<string | null>(null);
  const loadedB = useRef<string | null>(null);

  const videos = [vA, vB];
  const loaded = [loadedA, loadedB];
  const el = (i: number) => videos[i].current;
  const getPlaying = () => useEditor.getState().playing;
  const clampRate = (s: number) => Math.max(0.25, Math.min(4, s || 1));
  const setProps = (v: HTMLVideoElement, clip: { muted: boolean; speed: number }) => {
    v.muted = clip.muted;
    v.playbackRate = clampRate(clip.speed);
  };

  const logoUrl = logo.assetId ? assetMap.get(logo.assetId)?.url : undefined;
  const musicUrl = useMemo(() => {
    if (music.source === "builtin" && music.builtinId) return `/api/music?file=${music.builtinId}`;
    if (music.source === "upload" && music.assetId) return assetMap.get(music.assetId)?.url;
    return undefined;
  }, [music.source, music.builtinId, music.assetId, assetMap]);

  /** Preload the next clip's source onto the hidden video (paused, pre-seeked). */
  const preload = useCallback((nextClip: { assetId: string; in: number }) => {
    const bi = 1 - frontIdxRef.current;
    const bv = el(bi);
    if (!bv) return;
    if (loaded[bi].current === nextClip.assetId) return;
    const asset = assetMapRef.current.get(nextClip.assetId);
    if (!asset) return;
    loaded[bi].current = nextClip.assetId;
    bv.src = asset.url;
    const onL = () => {
      bv.removeEventListener("loadeddata", onL);
      try {
        bv.currentTime = nextClip.in;
      } catch {}
      bv.pause();
    };
    bv.addEventListener("loadeddata", onL);
    bv.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Show the clip at timeline time `t` on the front video (swap if needed). */
  const applyAt = useCallback((t: number, autoplay: boolean) => {
    const tl = timelineRef.current;
    if (!tl.clips.length) return;
    const clip = clipAtTime(tl, t);
    if (!clip) return;
    const asset = assetMapRef.current.get(clip.assetId);
    if (!asset) return;
    const desired = timelineToSource(clip, t);
    const fi = frontIdxRef.current;
    const fv = el(fi);

    if (loaded[fi].current === clip.assetId && fv) {
      setProps(fv, clip);
      try {
        fv.currentTime = desired;
      } catch {}
      if (autoplay && getPlaying()) fv.play().catch(() => {});
      else if (!autoplay) fv.pause();
      return;
    }

    // Load onto the back video; keep the front frame visible until ready, then swap.
    const bi = 1 - fi;
    const bv = el(bi);
    if (!bv) return;
    loaded[bi].current = clip.assetId;
    stallRef.current = true;
    bv.src = asset.url;
    let done = false;
    const cleanup = () => {
      bv.removeEventListener("loadeddata", finish);
      bv.removeEventListener("canplay", finish);
      bv.removeEventListener("error", onErr);
      clearTimeout(timer);
    };
    function finish() {
      if (done) return;
      done = true;
      cleanup();
      try {
        bv!.currentTime = Math.max(0, desired);
      } catch {}
      setProps(bv!, clip!);
      frontIdxRef.current = bi;
      setFrontIdx(bi);
      stallRef.current = false;
      if (autoplay && getPlaying()) bv!.play().catch(() => {});
      const old = el(fi);
      if (old) old.pause();
    }
    function onErr() {
      if (done) return;
      done = true;
      cleanup();
      stallRef.current = false;
    }
    const timer = setTimeout(finish, 4000);
    bv.addEventListener("loadeddata", finish);
    bv.addEventListener("canplay", finish);
    bv.addEventListener("error", onErr);
    bv.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Master-clock loop: timeline time advances by real elapsed time; front video
  // is slaved to it; the next source is preloaded on the back video.
  const tick = useCallback(
    (now: number) => {
      const tl = timelineRef.current;
      if (!tl.clips.length) {
        lastTsRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = lastTsRef.current ? Math.min(0.25, (now - lastTsRef.current) / 1000) : 0;
      lastTsRef.current = now;
      let p = playheadRef.current;
      if (!stallRef.current) p += dt;
      if (p >= tl.duration) {
        playheadRef.current = tl.duration;
        setCurrentTime(tl.duration);
        el(frontIdxRef.current)?.pause();
        setPlaying(false);
        syncMusic();
        return;
      }
      playheadRef.current = p;
      setCurrentTime(p);

      const clip = clipAtTime(tl, p);
      if (clip) {
        const fi = frontIdxRef.current;
        const fv = el(fi);
        if (loaded[fi].current === clip.assetId && !stallRef.current && fv) {
          const desired = timelineToSource(clip, p);
          setProps(fv, clip);
          if (fv.paused && getPlaying()) fv.play().catch(() => {});
          if (Math.abs(fv.currentTime - desired) > 0.2) {
            try {
              fv.currentTime = desired;
            } catch {}
          }
          const next = tl.clips[clip.index + 1];
          if (next && next.assetId !== clip.assetId && loaded[1 - fi].current !== next.assetId) {
            preload(next);
          }
        } else if (!stallRef.current) {
          applyAt(p, true);
        }
      }
      syncMusic();
      rafRef.current = requestAnimationFrame(tick);
    },
    [applyAt, preload, setCurrentTime, setPlaying, syncMusic]
  );

  // Start / stop.
  useEffect(() => {
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
      el(frontIdxRef.current)?.pause();
      musicRef.current?.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Explicit seeks.
  useEffect(() => {
    const t = useEditor.getState().currentTime;
    playheadRef.current = t;
    applyAt(t, useEditor.getState().playing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekNonce]);

  // Clips changed while paused → refresh displayed frame.
  useEffect(() => {
    if (!useEditor.getState().playing) {
      const ids = new Set(clips.map((c) => c.assetId));
      if (loadedA.current && !ids.has(loadedA.current)) loadedA.current = null;
      if (loadedB.current && !ids.has(loadedB.current)) loadedB.current = null;
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

  // Output frame aspect ratio.
  const ratio = useMemo(() => {
    if (settings.aspect === "original") {
      const a = clips[0] && assetMap.get(clips[0].assetId);
      if (a?.width && a?.height) return a.width / a.height;
      return 9 / 16;
    }
    const p = ASPECT_PRESETS[settings.aspect];
    return p.w / p.h;
  }, [settings.aspect, clips, assetMap]);

  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const measure = () => {
      const elw = wrapRef.current;
      if (!elw) return;
      const availW = elw.clientWidth - 8;
      const availH = elw.clientHeight - 8;
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
  const enterFullscreen = () => frameRef.current?.requestFullscreen?.().catch(() => {});

  const vClass = "absolute inset-0 h-full w-full bg-black object-contain";

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-3">
      <div ref={wrapRef} className="relative flex w-full flex-1 items-center justify-center overflow-hidden">
        <div
          ref={frameRef}
          className="relative overflow-hidden rounded-2xl bg-black shadow-glass ring-1 ring-white/5"
          style={{ width: frameSize.w || undefined, height: frameSize.h || undefined, containerType: "size" }}
        >
          <video ref={vA} playsInline className={vClass} style={{ opacity: frontIdx === 0 ? 1 : 0, zIndex: frontIdx === 0 ? 2 : 1 }} />
          <video ref={vB} playsInline className={vClass} style={{ opacity: frontIdx === 1 ? 1 : 0, zIndex: frontIdx === 1 ? 2 : 1 }} />
          {!hasContent && (
            <div className="absolute inset-0 z-10 grid place-items-center text-center">
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

      <div className="mt-3 flex w-full items-center justify-center gap-3">
        <button onClick={goStart} className="btn-soft h-10 w-10 !px-0" title="Başa dön (Home)">
          <SkipBack className="h-4 w-4" />
        </button>
        <button onClick={togglePlay} disabled={!hasContent} className="btn-primary h-12 w-12 !rounded-2xl !px-0" title="Oynat / Duraklat (Boşluk)">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <div className="min-w-[120px] rounded-xl bg-black/30 px-3 py-2 text-center font-mono text-xs tabular-nums text-slate-300">
          {formatTimecode(currentTime)} <span className="text-slate-600">/</span> {formatTimecode(timeline.duration)}
        </div>
        <button onClick={enterFullscreen} className="btn-soft h-10 w-10 !px-0" title="Tam ekran">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
