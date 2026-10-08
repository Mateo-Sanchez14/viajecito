"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AMBIENT_VIDEO_ENABLED } from "@/ui/ambient/scenes";

type AmbientVideoProps = {
  /** Self-hosted, content-hashed MP4: muted, loopable, no audio track. */
  src: string;
  /** WebP still shown first, and alone when `play` is false. */
  poster: string;
  /** Whether a video may play at all (motion allowed, no data saving). Decided by the container. */
  play: boolean;
  className?: string;
};

/**
 * A decorative destination loop: the poster fades in, then the muted video once it is playing.
 * It only plays while on screen and while the tab is visible, never takes focus or pointer
 * events, and every failure (blocked autoplay, load error, offline) leaves the poster showing.
 */
export function AmbientVideo({ src, poster, play, className = "" }: AmbientVideoProps) {
  const canPlay = play && AMBIENT_VIDEO_ENABLED;
  const [posterReady, setPosterReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  // A server-rendered poster may finish loading before hydration attaches onLoad.
  const posterRef = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setPosterReady(true);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!canPlay || !element) return;
    element.muted = true; // React does not reliably reflect `muted` as an attribute
    element.defaultMuted = true;
    let inView = true;
    const sync = () => {
      if (inView && document.visibilityState === "visible") {
        const attempt = element.play();
        // Autoplay refused (Low Power Mode, data saver): the poster stays.
        if (attempt && typeof attempt.catch === "function") attempt.catch(() => setPlaying(false));
      } else {
        element.pause();
      }
    };
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([entry]) => {
              inView = entry.isIntersecting;
              sync();
            },
            { threshold: 0.15 },
          )
        : null;
    observer?.observe(element);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      element.pause();
    };
  }, [canPlay, src]);

  return (
    <div
      className={`ambient-media ${className}`}
      aria-hidden="true"
      data-poster={posterReady ? "" : undefined}
      data-playing={playing && canPlay ? "" : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative, content-hashed static file: no resizing wanted */}
      <img
        ref={posterRef}
        className="ambient-poster"
        src={poster}
        alt=""
        decoding="async"
        onLoad={() => setPosterReady(true)}
      />
      {canPlay && (
        <video
          ref={video}
          className="ambient-video"
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setPlaying(false)}
        />
      )}
    </div>
  );
}
