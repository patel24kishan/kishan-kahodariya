import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Chip.module.css';

export interface ChipProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** `accent` draws the border in the accent border colour (emphasised skill groups). */
  variant?: 'default' | 'accent';
  /** `md` (default) for skills, `sm` for the small tag chips on cards. */
  size?: 'md' | 'sm';
  /** `rounded` (8px, default) or `pill`. Card tags use `pill`. */
  shape?: 'rounded' | 'pill';
  /** Element to render: span (default) or li inside a role="list". */
  as?: ElementType;
}

/**
 * Chip — a non-interactive tag or skill label.
 *
 *   <Chip>Unity3D</Chip>
 *   <Chip variant="accent">Netcode</Chip>          emphasised group
 *   <Chip size="sm" shape="pill" as="li">C#</Chip> card tag
 */
export function Chip({ children, variant = 'default', size = 'md', shape = 'rounded', as: Tag = 'span', className, ...rest }: ChipProps) {
  return (
    <Tag className={cx(styles.chip, variant === 'accent' && styles.accent, size === 'sm' && styles.sm, shape === 'pill' && styles.pill, className)} {...rest}>
      {children}
    </Tag>
  );
}
