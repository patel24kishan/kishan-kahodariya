import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './VisuallyHidden.module.css';

export interface VisuallyHiddenProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Element to render. Default span. */
  as?: ElementType;
}

/** Class that hides an element visually but keeps it in the accessibility tree. */
export const visuallyHiddenClass = styles.srOnly;

/**
 * VisuallyHidden — text for screen readers only ("(opens in a new tab)", live-region text,
 * extra context on icon buttons). Stays in the accessibility tree and in the reading order.
 */
export function VisuallyHidden({ as: Tag = 'span', className, children, ...rest }: VisuallyHiddenProps) {
  return (
    <Tag className={cx(styles.srOnly, className)} {...rest}>
      {children}
    </Tag>
  );
}
