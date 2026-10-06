import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import styles from './MediaOverlayButton.module.css';

export interface MediaOverlayButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Image source (already passed through assetUrl). */
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
}

/**
 * MediaOverlayButton — the project card media: a `<button>` showing the first screenshot.
 * On devices with hover, a dark scrim with a play icon and the label fades in on hover AND on
 * keyboard focus. On devices without hover the label is a permanent badge in the corner.
 * The accessible name is the image alt followed by the label.
 *
 *   <MediaOverlayButton src={shot.src} alt={shot.alt} width={1600} height={900}
 *     label={getHoverText(project)} onClick={() => openViewer(project)} />
 */
export function MediaOverlayButton({ src, alt, width, height, label, icon = 'play', aspectRatio = '16 / 9', loading = 'lazy', fetchPriority, className, style, type = 'button', ...rest }: MediaOverlayButtonProps) {
  const boxStyle = { ...style, '--media-aspect': aspectRatio } as CSSProperties;
  return (
    <button type={type} className={cx(styles.media, className)} style={boxStyle} data-media-overlay {...rest}>
      <img className={styles.image} src={src} alt={alt} width={width} height={height} loading={loading} decoding="async" fetchPriority={fetchPriority} />
      <span className={styles.label} data-media-label>
        <Icon name={icon} size={22} className={styles.icon} />
        <span className={styles.text}>{label}</span>
      </span>
    </button>
  );
}
