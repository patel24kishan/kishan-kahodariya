import type { SVGAttributes } from 'react';
import type { LinkIcon } from '@/content/types';

/** UI glyphs, in addition to the LinkIcon names from the content contract. */
export type UiIconName =
  | 'play'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'menu'
  | 'external'
  | 'sun'
  | 'moon';

export type IconName = LinkIcon | UiIconName;

interface Glyph {
  /** Stroked paths (2px, round caps and joins). */
  stroke?: string[];
  /** Filled paths. */
  fill?: string[];
}

/*
 * Original glyphs on a 24 × 24 grid. The link icons are simple, recognisable interpretations
 * (a cat for GitHub, a fox shape for GitLab, …), drawn here — no brand artwork files are used.
 */
const GLYPHS: Record<IconName, Glyph> = {
  github: {
    stroke: ['M12 20a8 8 0 1 0 0-16a8 8 0 0 0 0 16Z', 'M7 7.2 7.6 3.5 10.1 5.3', 'M17 7.2 16.4 3.5 13.9 5.3', 'M9 17.5c1 .8 5 .8 6 0'],
    fill: ['M9.5 10.3a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 0 0 0-2.2Z', 'M14.5 10.3a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 0 0 0-2.2Z'],
  },
  gitlab: {
    stroke: ['M3 11 6 3l2.5 8h7L18 3l3 8-9 9-9-9Z'],
  },
  linkedin: {
    stroke: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M8 10.5V17', 'M12 17v-6.5', 'M12 13.5a2.5 2.5 0 0 1 5 0V17'],
    fill: ['M8 6.5a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 0 0 0-2.4Z'],
  },
  youtube: {
    stroke: ['M6.5 6h11a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-11a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4Z'],
    fill: ['M10 9.2v5.6l4.8-2.8L10 9.2Z'],
  },
  itchio: {
    stroke: [
      'M7 8h10a4.5 4.5 0 0 1 4.5 4.5v1.2a3.3 3.3 0 0 1-5.8 2.1L14.3 14H9.7l-1.4 1.8a3.3 3.3 0 0 1-5.8-2.1v-1.2A4.5 4.5 0 0 1 7 8Z',
      'M7.5 10.8v3.4',
      'M5.8 12.5h3.4',
      'M16 11.6h.01',
      'M18 13.4h.01',
    ],
  },
  steam: {
    stroke: ['M15.5 11.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7Z', 'M7.5 19a2.6 2.6 0 1 0 0-5.2a2.6 2.6 0 0 0 0 5.2Z', 'M12.8 10.6 9.6 14.1', 'M3 15.2l2.8 1.2'],
  },
  email: {
    stroke: ['M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'M3.5 7.5 12 13l8.5-5.5'],
  },
  blog: {
    stroke: ['M6 3h9l4 4v14H6V3Z', 'M15 3v4h4', 'M9 12h6', 'M9 16h6'],
  },
  x: {
    stroke: ['M5 4l14 16', 'M19 4 5 20'],
  },
  discord: {
    stroke: ['M8 5.6A13 13 0 0 1 16 5.6l1.6 3c1 3 1.4 6 .9 9l-3.4 1.4-1-2.3H9.9l-1 2.3-3.4-1.4c-.5-3-.1-6 .9-9l1.6-3Z'],
    fill: ['M9.6 11.6a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 0 0 0-2.6Z', 'M14.4 11.6a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 0 0 0-2.6Z'],
  },
  link: {
    stroke: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5'],
  },
  play: {
    fill: ['M7 4.5v15l12-7.5L7 4.5Z'],
  },
  close: {
    stroke: ['M6 6l12 12', 'M18 6 6 18'],
  },
  'chevron-left': {
    stroke: ['M15 5l-7 7 7 7'],
  },
  'chevron-right': {
    stroke: ['M9 5l7 7-7 7'],
  },
  menu: {
    stroke: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  },
  external: {
    stroke: ['M14 4h6v6', 'M20 4l-9 9', 'M18 13v6H5V6h6'],
  },
  sun: {
    stroke: ['M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z', 'M12 2v2', 'M12 20v2', 'M2 12h2', 'M20 12h2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  },
  moon: {
    stroke: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z'],
  },
};

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Rendered size in px (width = height). Default 20. */
  size?: number;
  /**
   * Accessible name. Omit for decorative icons next to text (the default: aria-hidden).
   * Provide it only when the icon stands alone and carries meaning.
   */
  label?: string;
}

/**
 * Icon — inline SVG glyph, `currentColor`, 2px strokes. Decorative by default (`aria-hidden`).
 *
 *   <Icon name="github" />                 decorative, inherits the text colour
 *   <Icon name="external" size={16} />
 *   <Icon name="play" label="Video" />     exposed as role="img" with that name
 */
export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  const glyph = GLYPHS[name];
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={className}
      data-icon={name}
      {...a11y}
      {...rest}
    >
      {glyph.stroke?.map((d) => <path key={d} d={d} />)}
      {glyph.fill?.map((d) => <path key={d} d={d} fill="currentColor" stroke="none" />)}
    </svg>
  );
}
