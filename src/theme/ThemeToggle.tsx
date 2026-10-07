import { useTheme } from './ThemeProvider';
import styles from './ThemeToggle.module.css';

export interface ThemeToggleProps {
  /** Extra class on the <button>, for placement only (margins, alignment). */
  className?: string;
  id?: string;
}

/**
 * ThemeToggle — the sun / moon pill switch (ARCHITECTURE.md §5).
 *
 * A real `<button role="switch">`. `aria-checked` is true when light mode is on; the accessible
 * name states the action ("Switch to light mode" / "Switch to dark mode"). The visible pill is
 * 48 × 22px, centred in a 48 × 44px hit area (the button itself), so the control stays easy to
 * tap although it is drawn small. Night: navy sky, stars, moon knob on the right. Day: blue
 * sky, clouds, sun knob on the left. The knob slides with `transform`, the skies and the knob
 * faces cross-fade with `opacity`; both are instant under prefers-reduced-motion.
 *
 * The keyboard focus ring is drawn around the pill (`data-focus-ring`), not around the taller
 * hit area. Looks right on the canvas and inside a `[data-on-accent]` band (the ring turns
 * near-black).
 */
export function ThemeToggle({ className, id }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const classes = className ? `${styles.toggle} ${className}` : styles.toggle;

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={isLight}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={classes}
      data-theme-toggle
      onClick={toggleTheme}
    >
      <span className={styles.pill} aria-hidden="true" data-theme-toggle-pill data-focus-ring>
        {/* Night sky: glow rings around the moon, stars on the left */}
        <span className={`${styles.sky} ${styles.night}`}>
          <svg viewBox="0 0 48 22" width="48" height="22" focusable="false">
            <circle cx="37" cy="11" r="18" fill="#ffffff" opacity="0.05" />
            <circle cx="37" cy="11" r="13.5" fill="#ffffff" opacity="0.06" />
            <circle cx="37" cy="11" r="9.5" fill="#ffffff" opacity="0.07" />
            <path d="M9 4.6 L9.8 7.2 L12.4 8 L9.8 8.8 L9 11.4 L8.2 8.8 L5.6 8 L8.2 7.2 Z" fill="#ffffff" />
            <path d="M18 12 L18.55 13.65 L20.2 14.2 L18.55 14.75 L18 16.4 L17.45 14.75 L15.8 14.2 L17.45 13.65 Z" fill="#ffffff" />
            <circle cx="15" cy="5" r="0.75" fill="#ffffff" />
            <circle cx="7" cy="16.2" r="0.75" fill="#ffffff" opacity="0.9" />
            <circle cx="22.5" cy="7.5" r="0.75" fill="#ffffff" opacity="0.8" />
            <circle cx="24.5" cy="17" r="0.6" fill="#ffffff" opacity="0.7" />
          </svg>
        </span>
        {/* Day sky: clouds on the right */}
        <span className={`${styles.sky} ${styles.day}`}>
          <svg viewBox="0 0 48 22" width="48" height="22" focusable="false">
            <circle cx="11" cy="11" r="18" fill="#ffffff" opacity="0.06" />
            <circle cx="11" cy="11" r="13" fill="#ffffff" opacity="0.07" />
            <g fill="#ffffff">
              <ellipse cx="33" cy="14.2" rx="5.4" ry="3.1" />
              <ellipse cx="37.2" cy="11.7" rx="4.8" ry="4.3" />
              <ellipse cx="41.4" cy="14.2" rx="5.4" ry="3.4" />
            </g>
            <g fill="#ffffff" opacity="0.85">
              <ellipse cx="25.4" cy="5.6" rx="3.6" ry="1.9" />
              <ellipse cx="27.8" cy="4.7" rx="2.4" ry="2" />
            </g>
          </svg>
        </span>
        {/* Knob: moon face and sun face cross-fade while the knob slides */}
        <span className={styles.knob} data-theme-toggle-knob>
          <svg className={styles.moon} viewBox="0 0 26 26" width="16" height="16" focusable="false">
            <circle cx="13" cy="13" r="13" fill="#d9dce3" />
            <circle cx="9" cy="9" r="3.2" fill="#aab0bb" />
            <circle cx="17" cy="15" r="2.6" fill="#aab0bb" />
            <circle cx="10.5" cy="18.5" r="1.8" fill="#aab0bb" />
          </svg>
          <svg className={styles.sun} viewBox="0 0 26 26" width="16" height="16" focusable="false">
            <circle cx="13" cy="13" r="13" fill="#ffcf33" />
            <circle cx="13" cy="13" r="8.5" fill="#ffe27a" />
          </svg>
        </span>
      </span>
    </button>
  );
}
