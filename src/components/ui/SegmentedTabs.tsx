import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './SegmentedTabs.module.css';

export interface SegmentedTabItem {
  /** Stable id (category id or "all"). */
  id: string;
  label: string;
  /** Destination of the link — the address always reflects the open tab. */
  href: string;
  /** True for the open tab. Exactly one item should be current. */
  current: boolean;
}

/** Props handed to `renderLink` so a router Link can take over rendering. */
export interface SegmentedTabLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  className: string;
  'aria-current': 'page' | undefined;
  children: ReactNode;
}

export interface SegmentedTabsProps {
  items: SegmentedTabItem[];
  /** Accessible name of the navigation landmark, for example "Project categories". */
  label: string;
  /**
   * Custom link renderer, so the router's link component is used and navigation does not
   * scroll to the top:
   *   renderLink={(item, props) => <Link to={item.href} preventScrollReset {...props} />}
   * Default: a plain `<a href>`.
   */
  renderLink?: (item: SegmentedTabItem, props: SegmentedTabLinkProps) => ReactNode;
  className?: string;
}

/**
 * SegmentedTabs — a segmented control made of links. The current item is filled with the
 * accent and marked `aria-current="page"`. On narrow screens the items stretch to the full
 * width; when they still do not fit, the control scrolls horizontally without clipping.
 */
export function SegmentedTabs({ items, label, renderLink, className }: SegmentedTabsProps) {
  return (
    <nav aria-label={label} className={cx(styles.nav, className)}>
      <div className={styles.scroller}>
        <ul role="list" className={styles.list}>
          {items.map((item) => {
            const linkProps: SegmentedTabLinkProps = {
              className: styles.link,
              'aria-current': item.current ? 'page' : undefined,
              children: item.label,
            };
            return (
              <li key={item.id} className={styles.item} data-tab={item.id}>
                {renderLink ? renderLink(item, linkProps) : <a href={item.href} {...linkProps} />}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
