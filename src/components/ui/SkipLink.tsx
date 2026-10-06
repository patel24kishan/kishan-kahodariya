import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './SkipLink.module.css';

export interface SkipLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Target anchor, for example "#main". */
  href: string;
  children?: ReactNode;
}

/**
 * SkipLink — the first focusable element on the page. Hidden until it receives keyboard focus,
 * then shown top-left on an accent fill. The target element needs `tabIndex={-1}` or must be a
 * focusable landmark (`<main id="main" tabIndex={-1}>`).
 */
export function SkipLink({ href, children = 'Skip to content', className, ...rest }: SkipLinkProps) {
  return (
    <a href={href} className={cx(styles.skip, className)} {...rest}>
      {children}
    </a>
  );
}
