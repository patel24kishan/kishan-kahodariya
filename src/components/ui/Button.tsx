import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { VisuallyHidden } from './VisuallyHidden';
import styles from './Button.module.css';

/**
 * - `accent`   accent fill, near-black text — the primary action (resume, Gameplay, Play)
 * - `outline`  hairline border, ink text — secondary actions (hero links, View Code)
 * - `onAccent` near-black fill, accent text — ONLY inside an accent band (footer Connect)
 * - `ghost`    no border, body text — tertiary actions (nav links, menu items)
 */
export type ButtonVariant = 'accent' | 'outline' | 'onAccent' | 'ghost';

/** `md` is 44px tall (the minimum touch target), `lg` is 52px. */
export type ButtonSize = 'md' | 'lg';

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon, by name or as a ready element. */
  icon?: IconName | ReactNode;
  /** Trailing icon, by name or as a ready element. */
  iconEnd?: IconName | ReactNode;
  /** Stretch to the container width (card action rows on phones). */
  fullWidth?: boolean;
  className?: string;
}

/**
 * Class names for the button look, for elements this module does not render (for example a
 * router `<Link>` that must look like a button).
 */
export function buttonClassName({ variant = 'outline', size = 'md', fullWidth, className }: ButtonStyleProps = {}): string {
  return cx(styles.button, styles[variant], size === 'lg' && styles.lg, fullWidth && styles.fullWidth, className);
}

function renderIcon(icon: IconName | ReactNode | undefined, position: 'start' | 'end') {
  if (icon === undefined || icon === null || icon === false) return null;
  const node = typeof icon === 'string' ? <Icon name={icon as IconName} size={18} /> : icon;
  return <span className={cx(styles.icon, position === 'end' && styles.iconEnd)}>{node}</span>;
}

export interface ButtonProps extends ButtonStyleProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  children: ReactNode;
}

/**
 * Button — a `<button>` for actions (opening the viewer, toggling the menu, …).
 * `type` defaults to "button".
 *
 *   <Button variant="accent" icon="play" onClick={open}>Gameplay</Button>
 */
export function Button({ variant, size, icon, iconEnd, fullWidth, className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClassName({ variant, size, fullWidth, className })} data-variant={variant ?? 'outline'} {...rest}>
      {renderIcon(icon, 'start')}
      <span className={styles.label}>{children}</span>
      {renderIcon(iconEnd, 'end')}
    </button>
  );
}

export interface LinkButtonProps extends ButtonStyleProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'href'> {
  href: string;
  children: ReactNode;
  /**
   * Open in a new tab with `rel="noopener noreferrer"` and a visually hidden
   * "(opens in a new tab)". Defaults to true for absolute http(s) URLs, false otherwise.
   */
  external?: boolean;
}

const ABSOLUTE_URL = /^(https?:)?\/\//i;

/**
 * LinkButton — an `<a>` styled as a button, for navigation (resume, GitHub, Live Demo, …).
 * External links (absolute http(s) URLs, or `external`) open in a new tab safely and announce it.
 * For in-app routes use the router's Link with `buttonClassName()` instead.
 *
 *   <LinkButton variant="accent" href={track.resumeUrl}>{track.resumeLabel}</LinkButton>
 *   <LinkButton variant="onAccent" icon="github" href={link.url}>{link.label}</LinkButton>
 */
export function LinkButton({ variant, size, icon, iconEnd, fullWidth, className, href, external, children, ...rest }: LinkButtonProps) {
  const opensNewTab = external ?? ABSOLUTE_URL.test(href);
  const externalProps = opensNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <a href={href} className={buttonClassName({ variant, size, fullWidth, className })} data-variant={variant ?? 'outline'} {...externalProps} {...rest}>
      {renderIcon(icon, 'start')}
      <span className={styles.label}>
        {children}
        {opensNewTab && <VisuallyHidden> (opens in a new tab)</VisuallyHidden>}
      </span>
      {renderIcon(iconEnd, 'end')}
    </a>
  );
}
