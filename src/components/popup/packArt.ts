/**
 * The printed artwork of the pack, drawn once into a 2D canvas that the shader uses as a
 * texture (230 x 360 CSS px, drawn at 2x). Everything on it comes from site settings except
 * the logo image. The tear strip is the first 46px (crimp + a plain band).
 */

export const PACK_WIDTH = 230;
export const PACK_HEIGHT = 360;

export interface PackArtText {
  /** "BOOSTER PACK": the first word is big, the rest sits small under it. */
  title: string;
  /** The yellow band. */
  edition: string;
  /** The small line at the bottom. */
  footer: string;
}

/** Wait for the fonts the artwork uses (they are self-hosted; this is only the load). */
export function loadPackFonts(): Promise<void> {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([document.fonts.load('800 46px "Barlow Condensed"'), document.fonts.load('700 12px "Barlow Condensed"')]).then(
    () => undefined,
    () => undefined,
  );
}

/** Load the logo and cut the white background out of it (flood fill from the edges). */
export function loadLogo(src: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        resolve(cutOut(image));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function cutOut(image: HTMLImageElement): HTMLCanvasElement {
  // The picture has a few stray pixels along its edge: crop them off.
  const inset = 10;
  const width = image.naturalWidth - 2 * inset;
  const height = image.naturalHeight - 2 * inset;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.drawImage(image, inset, inset, width, height, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height);
  const pixels = data.data;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const isBackground = (index: number) =>
    (pixels[index * 4 + 3] ?? 255) < 24 || ((pixels[index * 4] ?? 0) > 238 && (pixels[index * 4 + 1] ?? 0) > 238 && (pixels[index * 4 + 2] ?? 0) > 238);
  const push = (x: number, y: number) => {
    const index = y * width + x;
    if (!seen[index] && isBackground(index)) {
      seen[index] = 1;
      stack.push(index);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % width;
    const y = (index - x) / width;
    pixels[index * 4 + 3] = 0;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  context.putImageData(data, 0, 0);
  return canvas;
}

export function drawPackArt(text: PackArtText, logo: HTMLCanvasElement | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PACK_WIDTH * 2;
  canvas.height = PACK_HEIGHT * 2;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.scale(2, 2);
  const w = PACK_WIDTH;
  const h = PACK_HEIGHT;
  const cx = w / 2;
  const spacing = (value: string) => {
    if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = value;
  };

  // Ground: deep blue to near black, like a printed foil pack.
  const ground = g.createLinearGradient(0, 0, 0, h);
  ground.addColorStop(0, '#0e2a6b');
  ground.addColorStop(0.5, '#0a1744');
  ground.addColorStop(1, '#070d26');
  g.fillStyle = ground;
  g.fillRect(0, 0, w, h);

  // Starburst behind the logo.
  const bx = cx;
  const by = 176;
  g.save();
  g.beginPath();
  g.rect(0, 22, w, h - 44);
  g.clip();
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2;
    const a1 = ((i + 0.5) / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + Math.cos(a0) * 260, by + Math.sin(a0) * 260);
    g.lineTo(bx + Math.cos(a1) * 260, by + Math.sin(a1) * 260);
    g.closePath();
    g.fillStyle = i % 2 ? 'rgba(250,255,105,.09)' : 'rgba(255,255,255,.04)';
    g.fill();
  }
  const glow = g.createRadialGradient(bx, by, 4, bx, by, 120);
  glow.addColorStop(0, 'rgba(255,255,220,.5)');
  glow.addColorStop(0.35, 'rgba(250,255,105,.2)');
  glow.addColorStop(1, 'rgba(250,255,105,0)');
  g.fillStyle = glow;
  g.fillRect(0, 22, w, h - 44);
  g.restore();

  // Bare foil crimps, top and bottom.
  g.fillStyle = '#2b323b';
  g.fillRect(0, 0, w, 22);
  g.fillRect(0, h - 22, w, 22);
  g.fillStyle = '#faff69';
  g.fillRect(0, 22, w, 3);
  g.fillRect(0, h - 25, w, 3);

  g.textAlign = 'center';
  g.lineJoin = 'round';

  // Title, outlined like a set logo: the first word big, the rest small under it.
  const words = text.title.trim().split(/\s+/);
  const big = (words[0] ?? '').toUpperCase();
  const small = words.slice(1).join(' ').toUpperCase();
  if (big !== '') {
    g.font = '800 46px "Barlow Condensed", sans-serif';
    spacing('4px');
    g.lineWidth = 7;
    g.strokeStyle = '#0a1744';
    g.strokeText(big, cx, 90);
    g.lineWidth = 3;
    g.strokeStyle = '#ffffff';
    g.strokeText(big, cx, 90);
    g.fillStyle = '#ffffff';
    g.fillText(big, cx, 90);
  }
  if (small !== '') {
    g.font = '700 12px "Barlow Condensed", sans-serif';
    spacing('7px');
    g.fillStyle = '#ffffff';
    g.fillText(small, cx + 3, 106);
  }

  // The logo, with a thin white sticker edge.
  if (logo) {
    const lh = 152;
    const lw = (lh * logo.width) / logo.height;
    g.save();
    g.shadowColor = 'rgba(255,255,255,.95)';
    g.shadowBlur = 5;
    g.drawImage(logo, cx - lw / 2, 112, lw, lh);
    g.drawImage(logo, cx - lw / 2, 112, lw, lh);
    g.restore();
  }

  // Edition band.
  if (text.edition.trim() !== '') {
    g.save();
    g.translate(cx, 288);
    g.rotate(-0.07);
    g.fillStyle = '#faff69';
    g.fillRect(-160, -15, 320, 30);
    g.fillStyle = '#0a1744';
    g.font = '800 19px "Barlow Condensed", sans-serif';
    spacing('4px');
    g.fillText(text.edition.toUpperCase(), 0, 6);
    g.restore();
  }

  // Bottom line.
  if (text.footer.trim() !== '') {
    g.fillStyle = '#c9d6ff';
    g.font = '700 12px "Barlow Condensed", sans-serif';
    spacing('3px');
    g.fillText(text.footer.toUpperCase(), cx, 332);
  }
  return canvas;
}
