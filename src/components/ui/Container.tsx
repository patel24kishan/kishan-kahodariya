import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Container.module.css';

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Element to render. Default div. */
  as?: ElementType;
  /** `default` = --container-max (1200px); `narrow` = 760px for reading-width text. */
  width?: 'default' | 'narrow';
}

/**
 * Container — centres content at `--container-max` with the responsive `--gutter`
 * (16 / 24 / 40px) on both sides.
 */
export function Container({ as: Tag = 'div', width = 'default', className, children, ...rest }: ContainerProps) {
  return (
    <Tag className={cx(styles.container, width === 'narrow' && styles.narrow, className)} {...rest}>
      {children}
    </Tag>
  );
}
