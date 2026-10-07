import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FocusEvent,
  type HTMLAttributeReferrerPolicy,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { useImageFailure } from './useImageFailure';
import styles from './MediaOverlayButton.module.css';

/** One screenshot of a slideshow (already passed through assetUrl). */
export interface MediaSlide {
  src: string;
  alt: string;
}

/** How long each screenshot stays before the media slides to the next one. */
export const SLIDE_INTERVAL_MS = 3000;

export interface MediaOverlayButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Image source (already passed through assetUrl). "" shows the fallback. */
  src: string;
  /** Image alt, for example "Scarfall cover image". */
  alt: string;
  /** Intrinsic image size, for layout stability. The box keeps `aspectRatio`, not this ratio. */
  width: number;
  height: number;
  /** Overlay / badge text: the project's hover text (max 4 words). */
  label: string;
  /** Overlay icon. Default `play`. */
  icon?: IconName;
  /** CSS aspect ratio of the media box. Default "16 / 9". */
  aspectRatio?: string;
  /** Lazy by default; pass "eager" for the first cards above the fold. */
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  /** Referrer policy of the image request; content images from other sites use "no-referrer". */
  referrerPolicy?: HTMLAttributeReferrerPolicy;
  /**
   * Shown in place of the image when `src` is empty or the image fails to load (phrasing
   * content only — it sits inside the button). Without it a broken image stays as it is.
   */
  fallback?: ReactNode;
  /**
   * Every screenshot of the project, in order (`src` / `alt` are the first one). With two or
   * more, the media slides through them every {@link SLIDE_INTERVAL_MS} while the button is
   * on screen, the page is visible and the pointer or focus is not on it; position dots sit at
   * the bottom. Screenshots that fail to load are skipped. Under `prefers-reduced-motion`
   * the first screenshot is shown statically. With fewer than two the button is the plain
   * single image.
   */
  slides?: readonly MediaSlide[];
  /**
   * The button was activated: `index` is the screenshot on show (0 for a single image) and
   * `button` the element focus should return to when a viewer closes. Fires after `onClick`.
   */
  onOpen?: (index: number, button: HTMLButtonElement) => void;
}

/**
 * MediaOverlayButton — the project card media: a `<button>` showing the first screenshot (or,
 * with `slides`, a slideshow of all of them). On devices with hover, a dark scrim with a play
 * icon and the label fades in on hover AND on keyboard focus. On devices without hover the
 * label is a permanent badge in the corner. The accessible name is the image alt (of the
 * screenshot on show) followed by the label.
 *
 *   <MediaOverlayButton src={shot.src} alt={shot.alt} width={1600} height={900}
 *     label={getHoverText(project)} onOpen={(index, el) => openViewer(project, index, el)}
 *     referrerPolicy="no-referrer" fallback={<span>No preview</span>} />
 */
export function MediaOverlayButton({ slides, src, alt, ...props }: MediaOverlayButtonProps) {
  if (slides && slides.length >= 2) return <SlidingMedia slides={slides} {...props} />;
  return <SingleMedia src={src} alt={alt} {...props} />;
}

type MediaProps = Omit<MediaOverlayButtonProps, 'slides'>;
type SlidingProps = Omit<MediaProps, 'src' | 'alt'> & { slides: readonly MediaSlide[] };

function Overlay({ icon, label }: { icon: IconName; label: string }) {
  return (
    <span className={styles.label} data-media-label>
      <Icon name={icon} size={22} className={styles.icon} />
      <span className={styles.text}>{label}</span>
    </span>
  );
}

/* ---- One image ---------------------------------------------------------------------------- */

function SingleMedia({
  src,
  alt,
  width,
  height,
  label,
  icon = 'play',
  aspectRatio = '16 / 9',
  loading = 'lazy',
  fetchPriority,
  referrerPolicy,
  fallback,
  onOpen,
  onClick,
  className,
  style,
  type = 'button',
  ...rest
}: MediaProps) {
  const boxStyle = { ...style, '--media-aspect': aspectRatio } as CSSProperties;
  const image = useImageFailure(src);
  const showFallback = image.failed && fallback !== undefined;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    onOpen?.(0, event.currentTarget);
  };
  return (
    <button type={type} className={cx(styles.media, className)} style={boxStyle} onClick={handleClick} data-media-overlay data-media-fallback={showFallback || undefined} {...rest}>
      {showFallback ? (
        <span className={styles.fallback}>{fallback}</span>
      ) : (
        <img
          ref={image.ref}
          onError={image.onError}
          className={styles.image}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          referrerPolicy={referrerPolicy}
        />
      )}
      <Overlay icon={icon} label={label} />
    </button>
  );
}

/* ---- Several images: the slideshow ------------------------------------------------------- */

/** The first index after `from` (wrapping) that has not failed; `from` itself when none. */
function nextLive(from: number, failed: readonly boolean[], count: number): number {
  for (let step = 1; step <= count; step += 1) {
    const index = (from + step) % count;
    if (!failed[index]) return index;
  }
  return from;
}

/**
 * The server and the first client render show slide 0 with no timer. Everything that depends
 * on the browser — the timer, whether the button is on screen, the page's visibility, the
 * motion preference — starts in effects, so the prerendered markup hydrates cleanly.
 */
function SlidingMedia({
  slides,
  width,
  height,
  label,
  icon = 'play',
  aspectRatio = '16 / 9',
  loading = 'lazy',
  fetchPriority,
  referrerPolicy,
  fallback,
  onOpen,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  className,
  style,
  type = 'button',
  ...rest
}: SlidingProps) {
  const count = slides.length;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [current, setCurrent] = useState(0);
  const [failed, setFailed] = useState<readonly boolean[]>(() => slides.map(() => false));
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const markFailed = useCallback((index: number) => {
    setFailed((previous) => (previous[index] ? previous : previous.map((value, candidate) => (candidate === index ? true : value))));
  }, []);

  const live = slides.map((_, index) => index).filter((index) => !failed[index]);
  const allFailed = live.length === 0;
  const canSlide = live.length >= 2;

  // A slide that turned out to be broken is never the one on show.
  useEffect(() => {
    if (failed[current] && !allFailed) setCurrent((shown) => nextLive(shown, failed, count));
  }, [current, failed, allFailed, count]);

  // Run only while the button is (mostly) on screen …
  useEffect(() => {
    const element = buttonRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setOnScreen(entry.isIntersecting);
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // … the document is visible …
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  // … and the visitor has not asked for less motion.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const running = canSlide && onScreen && pageVisible && !hovered && !focused && !reducedMotion;

  // The timer: one step per interval. Any change of state restarts it with a full interval.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setCurrent((shown) => nextLive(shown, failed, count)), SLIDE_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [running, current, failed, count]);

  // The slide that comes next is fetched while the current one is on show, so it is there
  // when the track moves (a lazy image clipped out of view by the track does not load).
  const upcoming = onScreen && canSlide && !reducedMotion ? nextLive(current, failed, count) : -1;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    onOpen?.(current, event.currentTarget);
  };
  const handleMouseEnter = (event: MouseEvent<HTMLButtonElement>) => {
    setHovered(true);
    onMouseEnter?.(event);
  };
  const handleMouseLeave = (event: MouseEvent<HTMLButtonElement>) => {
    setHovered(false);
    onMouseLeave?.(event);
  };
  const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
    setFocused(true);
    onFocus?.(event);
  };
  const handleBlur = (event: FocusEvent<HTMLButtonElement>) => {
    setFocused(false);
    onBlur?.(event);
  };

  const showFallback = allFailed && fallback !== undefined;
  const boxStyle = { ...style, '--media-aspect': aspectRatio, '--media-index': current } as CSSProperties;

  return (
    <button
      ref={buttonRef}
      type={type}
      className={cx(styles.media, className)}
      style={boxStyle}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      data-media-overlay
      data-media-carousel={showFallback ? undefined : ''}
      data-media-current={showFallback ? undefined : current}
      data-media-count={showFallback ? undefined : live.length}
      data-media-running={running || undefined}
      data-media-fallback={showFallback || undefined}
      {...rest}
    >
      {showFallback ? (
        <span className={styles.fallback}>{fallback}</span>
      ) : (
        <>
          <span className={styles.track} data-media-track>
            {slides.map((slide, index) => (
              <Slide
                key={index}
                slide={slide}
                index={index}
                current={index === current}
                width={width}
                height={height}
                loading={index === 0 ? loading : index === upcoming || index === current ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? fetchPriority : undefined}
                referrerPolicy={referrerPolicy}
                onFailed={markFailed}
              />
            ))}
          </span>
          {canSlide && (
            <span className={styles.dots} aria-hidden="true" data-media-dots>
              {live.map((index) => (
                <span key={index} className={cx(styles.dot, index === current && styles.dotActive)} data-media-dot={index === current ? 'active' : 'inactive'} />
              ))}
            </span>
          )}
        </>
      )}
      <Overlay icon={icon} label={label} />
    </button>
  );
}

interface SlideProps {
  slide: MediaSlide;
  index: number;
  current: boolean;
  width: number;
  height: number;
  loading: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  referrerPolicy?: HTMLAttributeReferrerPolicy;
  onFailed: (index: number) => void;
}

/** One slide. Slides that are not on show are hidden from assistive technology. */
function Slide({ slide, index, current, width, height, loading, fetchPriority, referrerPolicy, onFailed }: SlideProps) {
  const image = useImageFailure(slide.src);
  useEffect(() => {
    if (image.failed) onFailed(index);
  }, [image.failed, index, onFailed]);
  return (
    <span className={styles.slide} aria-hidden={current ? undefined : 'true'} data-media-slide={index} data-media-slide-state={image.failed ? 'failed' : current ? 'current' : 'hidden'}>
      {!image.failed && (
        <img
          ref={image.ref}
          onError={image.onError}
          className={styles.slideImage}
          src={slide.src}
          alt={slide.alt}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          referrerPolicy={referrerPolicy}
          draggable={false}
        />
      )}
    </span>
  );
}
