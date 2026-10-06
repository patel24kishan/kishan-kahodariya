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
 * name states the action ("Switch to light mode" / "Switch to dark mode"). The hit area is
 * 88 × 44px around an 80 × 36px pill. Night: navy sky, stars, moon knob on the right. Day: blue
 * sky, clouds, sun knob on the left. The knob slides with `transform`, the skies and the knob
 * faces cross-fade with `opacity`; both are instant under prefers-reduced-motion.
 *
 * Looks right on the canvas and inside a `[data-on-accent]` band (the ring turns near-black).
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
      <span className={styles.pill} aria-hidden="true">
        {/* Night sky: glow rings around the moon, stars on the left */}
        <span className={`${styles.sky} ${styles.night}`}>
          <svg viewBox="0 0 80 36" width="80" height="36" focusable="false">
            <circle cx="62" cy="18" r="30" fill="#ffffff" opacity="0.05" />
            <circle cx="62" cy="18" r="22" fill="#ffffff" opacity="0.06" />
            <circle cx="62" cy="18" r="15" fill="#ffffff" opacity="0.07" />
            <path d="M14 8 L15.2 11.8 L19 13 L15.2 14.2 L14 18 L12.8 14.2 L9 13 L12.8 11.8 Z" fill="#ffffff" />
            <path d="M29 20 L29.8 22.4 L32.2 23.2 L29.8 24 L29 26.4 L28.2 24 L25.8 23.2 L28.2 22.4 Z" fill="#ffffff" />
            <circle cx="24" cy="8" r="1" fill="#ffffff" />
            <circle cx="11" cy="26" r="1" fill="#ffffff" opacity="0.9" />
            <circle cx="37" cy="12" r="1" fill="#ffffff" opacity="0.8" />
            <circle cx="40" cy="27" r="0.8" fill="#ffffff" opacity="0.7" />
          </svg>
        </span>
        {/* Day sky: clouds on the right */}
        <span className={`${styles.sky} ${styles.day}`}>
          <svg viewBox="0 0 80 36" width="80" height="36" focusable="false">
            <circle cx="18" cy="18" r="30" fill="#ffffff" opacity="0.06" />
            <circle cx="18" cy="18" r="21" fill="#ffffff" opacity="0.07" />
            <g fill="#ffffff">
              <ellipse cx="55" cy="23" rx="9" ry="5" />
              <ellipse cx="62" cy="19" rx="8" ry="7" />
              <ellipse cx="69" cy="23" rx="9" ry="5.5" />
            </g>
            <g fill="#ffffff" opacity="0.85">
              <ellipse cx="42" cy="9" rx="6" ry="3" />
              <ellipse cx="46" cy="7.5" rx="4" ry="3.2" />
            </g>
          </svg>
        </span>
        {/* Knob: moon face and sun face cross-fade while the knob slides */}
        <span className={styles.knob}>
          <svg className={styles.moon} viewBox="0 0 26 26" width="26" height="26" focusable="false">
            <circle cx="13" cy="13" r="13" fill="#d9dce3" />
            <circle cx="9" cy="9" r="3.2" fill="#aab0bb" />
            <circle cx="17" cy="15" r="2.6" fill="#aab0bb" />
            <circle cx="10.5" cy="18.5" r="1.8" fill="#aab0bb" />
          </svg>
          <svg className={styles.sun} viewBox="0 0 26 26" width="26" height="26" focusable="false">
            <circle cx="13" cy="13" r="13" fill="#ffcf33" />
            <circle cx="13" cy="13" r="8.5" fill="#ffe27a" />
          </svg>
        </span>
      </span>
    </button>
  );
}
