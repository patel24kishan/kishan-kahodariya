/**
 * Dev-only WCAG contrast helpers for the kit page. Reads the computed token values from the
 * DOM, so the numbers shown are the ones the browser actually renders.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(input: string): Rgb | null {
  const value = input.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (rgb) {
    const alphaRaw = rgb[4];
    const a = alphaRaw === undefined ? 1 : alphaRaw.endsWith('%') ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a };
  }
  return null;
}

/** Composites `fg` over `bg` (both opaque unless fg has alpha). */
export function composite(fg: Rgb, bg: Rgb): Rgb {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const f = luminance(composite(fg, bg));
  const l = luminance(bg);
  const [hi, lo] = f > l ? [f, l] : [l, f];
  return (hi + 0.05) / (lo + 0.05);
}

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** The computed value of a custom property on an element, or "" when unset. */
export function readToken(el: Element, token: string): string {
  return getComputedStyle(el).getPropertyValue(token).trim();
}
