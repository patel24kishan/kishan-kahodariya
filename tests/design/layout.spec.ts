import { expect, test } from '@playwright/test';
import { openKit, presetTheme, THEMES, TRACKS } from './helpers';

test.describe('layout', () => {
  test('no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await presetTheme(page, 'dark');
    await openKit(page);
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      body: document.body.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(320);
    expect(widths.body).toBeLessThanOrEqual(320);

    // No element pokes out of the viewport either (overflow-x: clip could hide it).
    const poking = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > 320 + 0.5 && !el.closest('[class*="scroller"], [class*="tableWrap"]');
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
    );
    expect(poking, poking.join('\n')).toEqual([]);
  });

  test('section rhythm and gutters follow the breakpoint tokens', async ({ page, viewport }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { gap: cs.getPropertyValue('--section-gap').trim(), gutter: cs.getPropertyValue('--gutter').trim() };
    });
    const width = viewport?.width ?? 0;
    if (width >= 1024) expect(tokens).toEqual({ gap: '96px', gutter: '40px' });
    else if (width >= 768) expect(tokens).toEqual({ gap: '64px', gutter: '24px' });
    else expect(tokens).toEqual({ gap: '48px', gutter: '16px' });
  });

  test('Inter Variable is the rendered font', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('700 16px "Inter Variable"');
    });
    expect(loaded).toBe(true);
  });

  for (const theme of THEMES) {
    for (const track of TRACKS) {
      test(`screenshot of the kit — ${theme} / ${track}`, async ({ page }, testInfo) => {
        test.slow(); // a full-page raster of the whole kit; 'css' scale keeps the phone project (DPR 2.6) cheap
        await presetTheme(page, theme);
        await openKit(page, track);
        await page.waitForTimeout(300);
        const path = testInfo.outputPath(`kit-${theme}-${track}-${testInfo.project.name}.png`);
        await page.screenshot({ path, fullPage: true, scale: 'css', animations: 'disabled' });
        await testInfo.attach(`kit-${theme}-${track}`, { path, contentType: 'image/png' });
      });
    }
  }
});
