import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import type { ButtonVariant } from './Button';
import buttonStyles from './Button.module.css';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** The glyph. */
  icon: IconName;
  /** Required accessible name — what the button does ("Close viewer", "Open menu", "Next screenshot"). */
  label: string;
  variant?: ButtonVariant;
  /** `md` = 44px square, `lg` = 52px. */
  size?: 'md' | 'lg';
  /** `circle` for viewer controls, `rounded` (8px) for the menu button. Default rounded. */
  shape?: 'rounded' | 'circle';
  /** Icon size in px. Default 20 (24 for `lg`). */
  iconSize?: number;
}

/**
 * IconButton — an icon-only `<button>` with a mandatory accessible name.
 *
 *   <IconButton icon="close" label="Close viewer" shape="circle" onClick={close} />
 *   <IconButton icon="menu" label="Open menu" aria-expanded={open} aria-controls="site-menu" />
 */
export function IconButton({ icon, label, variant = 'outline', size = 'md', shape = 'rounded', iconSize, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(buttonStyles.button, buttonStyles[variant], styles.iconButton, size === 'lg' && styles.lg, shape === 'circle' && styles.circle, className)}
      data-variant={variant}
      {...rest}
    >
      <Icon name={icon} size={iconSize ?? (size === 'lg' ? 24 : 20)} />
    </button>
  );
}
