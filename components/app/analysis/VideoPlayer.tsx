"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { VideoSource } from "@/lib/analysis";

/* One player for the analysis screens: an MP4 (Veo, a direct link, or a file opened from this computer)
 * or a YouTube video, with the same controls either way (current time, seek, play, pause, speed). */

export type PlayerHandle = {
  time: () => number;
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  playing: () => boolean;
  rate: (r: number) => void;
};

type YTPlayer = {
  getCurrentTime: () => number;
  seekTo: (t: number, allow: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState: () => number;
  setPlaybackRate: (r: number) => void;
  destroy: () => void;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytLoading: Promise<void> | null = null;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve();
  ytLoading ??= new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytLoading;
}

export const VideoPlayer = forwardRef<PlayerHandle, { source: VideoSource; onTime?: (t: number) => void; className?: string }>(function VideoPlayer({ source, onTime, className }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const ytBox = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const [err, setErr] = useState("");

  useImperativeHandle(
    ref,
    () => ({
      time: () => (source.kind === "youtube" ? (yt.current?.getCurrentTime() ?? 0) : (video.current?.currentTime ?? 0)),
      seek: (t) => {
        const tt = Math.max(0, t);
        if (source.kind === "youtube") yt.current?.seekTo(tt, true);
        else if (video.current) video.current.currentTime = tt;
      },
      play: () => (source.kind === "youtube" ? yt.current?.playVideo() : void video.current?.play().catch(() => {})),
      pause: () => (source.kind === "youtube" ? yt.current?.pauseVideo() : video.current?.pause()),
      toggle: () => {
        if (source.kind === "youtube") {
          const p = yt.current;
          if (p) (p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo());
        } else if (video.current) (video.current.paused ? video.current.play().catch(() => {}) : video.current.pause());
      },
      playing: () => (source.kind === "youtube" ? yt.current?.getPlayerState() === 1 : !!video.current && !video.current.paused),
      rate: (r) => (source.kind === "youtube" ? yt.current?.setPlaybackRate(r) : video.current && (video.current.playbackRate = r)),
    }),
    [source],
  );

  // YouTube player
  useEffect(() => {
    if (source.kind !== "youtube" || !ytBox.current) return;
    let dead = false;
    const host = document.createElement("div");
    ytBox.current.appendChild(host);
    loadYouTube().then(() => {
      if (dead || !window.YT) return;
      yt.current = new window.YT.Player(host, { videoId: source.id, width: "100%", height: "100%", playerVars: { rel: 0, modestbranding: 1, playsinline: 1 } });
    });
    return () => {
      dead = true;
      yt.current?.destroy();
      yt.current = null;
      host.remove();
    };
  }, [source]);

  // Tell the parent the time a few times a second.
  useEffect(() => {
    if (!onTime) return;
    const i = setInterval(() => onTime(source.kind === "youtube" ? (yt.current?.getCurrentTime?.() ?? 0) : (video.current?.currentTime ?? 0)), 250);
    return () => clearInterval(i);
  }, [onTime, source]);

  if (source.kind === "none") return <div className={`ap-player ap-none ${className ?? ""}`}>{source.reason}</div>;
  if (source.kind === "youtube") return <div className={`ap-player ${className ?? ""}`} ref={ytBox} />;
  return (
    <div className={`ap-player ${className ?? ""}`}>
      <video ref={video} src={source.url} controls playsInline preload="metadata" onError={() => setErr("The video couldn't be played. If it's a Veo link, check the match is shared publicly, or open the downloaded file from this computer.")} />
      {err && <p className="ap-err">{err}</p>}
    </div>
  );
});
