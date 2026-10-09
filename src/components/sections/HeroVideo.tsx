import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, useImageFailure } from '@/components/ui';
import styles from './Hero.module.css';

export interface HeroVideoProps {
  /** The video's final URL (already through assetUrl()). "" renders no <video> at all. */
  src: string;
  /** The poster's final URL (already through assetUrl()). "" means none. */
  poster: string;
}

interface ConnectionHint {
  connection?: { saveData?: boolean };
}

/** true when the visitor asked for less motion or for less data: the video then waits for the play button. */
function prefersStill(): boolean {
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = (navigator as Navigator & ConnectionHint).connection?.saveData === true;
  return reduced || saveData;
}

/**
 * HeroVideo — what is behind the hero's text, back to front: a dark gradient (always there),
 * the poster image, the looping video, and a scrim that keeps the text readable. All of it is
 * decorative (aria-hidden, nothing focusable). The pause / play button is the one control; it
 * is rendered next to the layers, outside the hidden box.
 *
 * The server and the first client render are the same markup: a <video> that loads nothing
 * (`preload="none"`, no `autoplay` attribute) and a button in its "playing" state. After mount
 * the video is started from an effect — unless the visitor prefers reduced motion or has data
 * saving on, in which case it stays still until they press play. It is paused while the hero
 * is off screen or the tab is hidden, and resumes by itself only if the visitor did not pause it.
 *
 * When the video cannot be played the element is taken out and the button with it; what is
 * left is the poster, or the gradient when there is no poster or it does not load either.
 */
export function HeroVideo({ src, poster }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterImage = useImageFailure(poster);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  /** What the visitor (or their settings) asked for; the effect below reads it without re-running. */
  const pausedRef = useRef(false);
  const applyRef = useRef<() => void>(() => undefined);
  const hasVideo = src !== '' && !failed;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let onScreen = true;
    let cancelled = false;

    if (prefersStill()) {
      pausedRef.current = true;
      setPaused(true);
    } else {
      // Only now, for a visitor who may be shown motion: in the server's HTML the attribute
      // would start the video before this check could run.
      video.autoplay = true;
    }
    // A request that failed before React attached (a prerendered page) left no event behind.
    if (video.error) {
      setFailed(true);
      return;
    }

    const apply = () => {
      const shouldPlay = !pausedRef.current && onScreen && document.visibilityState === 'visible';
      if (!shouldPlay) {
        video.pause();
        return;
      }
      video.muted = true;
      video.play().catch((error: unknown) => {
        // The browser refused to start it by itself: show the button as paused, so one press
        // plays. Anything else (no playable source) arrives as an error event as well.
        if (!cancelled && error instanceof DOMException && error.name === 'NotAllowedError') {
          pausedRef.current = true;
          setPaused(true);
        }
      });
    };
    applyRef.current = apply;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      onScreen = entry.isIntersecting;
      apply();
    });
    observer.observe(video);
    document.addEventListener('visibilitychange', apply);
    apply();

    return () => {
      cancelled = true;
      applyRef.current = () => undefined;
      observer.disconnect();
      document.removeEventListener('visibilitychange', apply);
      video.pause();
    };
  }, [src]);

  const toggle = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    applyRef.current();
  }, []);

  return (
    <>
      <div className={styles.backdrop} aria-hidden="true" data-hero-backdrop>
        {!posterImage.failed && (
          // Inside <picture>: keeps React from hoisting a preload <link> (logs/issues/pages-03).
          <picture className={styles.media}>
            <img
              ref={posterImage.ref}
              onError={posterImage.onError}
              src={poster}
              alt=""
              width={1920}
              height={1080}
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              className={styles.mediaFill}
              data-hero-poster
            />
          </picture>
        )}
        {hasVideo && (
          <video
            ref={videoRef}
            className={`${styles.media} ${styles.mediaFill}`}
            src={src}
            poster={poster || undefined}
            muted
            loop
            playsInline
            preload="none"
            tabIndex={-1}
            disablePictureInPicture
            disableRemotePlayback
            onError={() => setFailed(true)}
            data-hero-video
          />
        )}
        <div className={styles.scrim} data-hero-scrim />
      </div>
      {hasVideo && (
        <button type="button" className={styles.pause} aria-label="Pause background video" aria-pressed={paused} onClick={toggle} data-hero-pause>
          <Icon name={paused ? 'play' : 'pause'} size={16} />
        </button>
      )}
    </>
  );
}
