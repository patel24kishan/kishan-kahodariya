import { expect, test } from '@playwright/test';
import { createPaths, isAbsoluteUrl, isExternalUrl, trackPath } from '../../src/lib/paths';
import { siteMap } from './support/site-map';

/**
 * Unit tests for src/lib/paths.ts. The pure helpers run in Node; the last block checks the
 * same helpers bound to the real base path inside the running app.
 */
test.describe('paths: pure helpers', () => {
  const paths = createPaths('/My-Portfolio/', 'https://example.test');

  test('assetUrl gives root-relative content paths the base', () => {
    expect(paths.assetUrl('/images/profile.jpg')).toBe('/My-Portfolio/images/profile.jpg');
    expect(paths.assetUrl('/uploads/scarfall 1.webp')).toBe('/My-Portfolio/uploads/scarfall 1.webp');
    expect(paths.assetUrl('images/profile.jpg')).toBe('/My-Portfolio/images/profile.jpg');
    expect(paths.assetUrl('//images/profile.jpg')).toBe('//images/profile.jpg'); // protocol-relative URL, not a path
  });

  test('assetUrl leaves "" as ""', () => {
    expect(paths.assetUrl('')).toBe('');
  });

  test('assetUrl passes absolute URLs, hashes and queries through', () => {
    for (const url of [
      'https://example.com/a.png',
      'http://example.com/a.png',
      'HTTPS://EXAMPLE.COM/A.PNG',
      '//cdn.example.com/a.png',
      'data:image/png;base64,AAAA',
      'blob:https://example.com/1234',
      'mailto:someone@example.com',
      'tel:+15550100',
      '#projects',
      '?tab=unity',
    ]) {
      expect(paths.assetUrl(url), url).toBe(url);
    }
  });

  test('the base is normalised however it is written', () => {
    for (const base of ['/My-Portfolio/', '/My-Portfolio', 'My-Portfolio/', 'My-Portfolio', '//My-Portfolio//']) {
      expect(createPaths(base).base, base).toBe('/My-Portfolio/');
      expect(createPaths(base).assetUrl('/a.png'), base).toBe('/My-Portfolio/a.png');
    }
    expect(createPaths('/').base).toBe('/');
    expect(createPaths('').base).toBe('/');
    expect(createPaths('/').assetUrl('/images/a.png')).toBe('/images/a.png');
    expect(createPaths('/nested/site/').assetUrl('/a.png')).toBe('/nested/site/a.png');
  });

  test('trackPath builds router paths for a page and a tab', () => {
    expect(trackPath('gamedev')).toBe('/gamedev');
    expect(trackPath('gamedev', 'unity')).toBe('/gamedev/unity');
    expect(trackPath({ route: 'softdev' })).toBe('/softdev');
    expect(trackPath({ route: 'softdev' }, 'webapps')).toBe('/softdev/webapps');
    expect(trackPath('/gamedev/', 'all')).toBe('/gamedev/all');
    expect(trackPath('gamedev', '')).toBe('/gamedev');
    expect(trackPath('gamedev', 'c# tools')).toBe('/gamedev/c%23%20tools');
  });

  test('routeHref and trackHref apply the base', () => {
    expect(paths.routeHref('/')).toBe('/My-Portfolio/');
    expect(paths.routeHref('/gamedev/unity')).toBe('/My-Portfolio/gamedev/unity');
    expect(paths.routeHref('/softdev#projects')).toBe('/My-Portfolio/softdev#projects');
    expect(paths.trackHref('gamedev')).toBe('/My-Portfolio/gamedev');
    expect(paths.trackHref({ route: 'softdev' }, 'all')).toBe('/My-Portfolio/softdev/all');
    expect(createPaths('/').routeHref('/')).toBe('/');
    expect(createPaths('/').trackHref('gamedev', 'unity')).toBe('/gamedev/unity');
  });

  test('absoluteUrl and absoluteAssetUrl add the site origin', () => {
    expect(paths.absoluteUrl('/')).toBe('https://example.test/My-Portfolio/');
    expect(paths.absoluteUrl('/softdev')).toBe('https://example.test/My-Portfolio/softdev');
    expect(createPaths('/My-Portfolio/', 'https://example.test/').absoluteUrl('/softdev')).toBe(
      'https://example.test/My-Portfolio/softdev',
    );
    expect(paths.absoluteAssetUrl('/images/profile.jpg')).toBe('https://example.test/My-Portfolio/images/profile.jpg');
    expect(paths.absoluteAssetUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(paths.absoluteAssetUrl('')).toBe('');
  });

  test('isExternalUrl is true only for web links that leave the site', () => {
    for (const url of ['https://github.com/x', 'http://example.com', 'HTTPS://EXAMPLE.COM', '//example.com/x', '  https://example.com']) {
      expect(isExternalUrl(url), url).toBe(true);
    }
    for (const url of ['', '/gamedev', 'gamedev/unity', '#projects', '?a=1', 'mailto:a@b.co', 'tel:+15550100', 'data:text/plain,hi', 'https', 'httpsx://x']) {
      expect(isExternalUrl(url), url).toBe(false);
    }
  });

  test('isAbsoluteUrl is true for anything with a scheme', () => {
    for (const url of ['https://a.b', 'mailto:a@b.co', 'tel:+1', 'data:text/plain,hi', '//a.b/c', 'blob:https://a.b/1']) {
      expect(isAbsoluteUrl(url), url).toBe(true);
    }
    for (const url of ['', '/images/a.png', 'images/a.png', '#x', '?x=1', './a.png', '/a:b.png']) {
      expect(isAbsoluteUrl(url), url).toBe(false);
    }
  });
});

test.describe('paths: bound to the running build', () => {
  test('assetUrl, routeHref and absoluteUrl use the configured base and origin', async ({ page, baseURL, request }) => {
    await page.goto('./');
    const moduleUrl = new URL('src/lib/paths.ts', baseURL).href;
    const result = await page.evaluate(async (url) => {
      const paths = (await import(/* @vite-ignore */ url)) as typeof import('../../src/lib/paths');
      return {
        asset: paths.assetUrl('/images/profile.jpg'),
        empty: paths.assetUrl(''),
        external: paths.assetUrl('https://example.com/a.png'),
        home: paths.routeHref('/'),
        deep: paths.trackHref('softdev', 'webapps'),
        absolute: paths.absoluteUrl('/softdev'),
        basename: paths.routerBasename(),
      };
    }, moduleUrl);

    expect(result).toEqual({
      asset: `${siteMap.base}images/profile.jpg`,
      empty: '',
      external: 'https://example.com/a.png',
      home: siteMap.base,
      deep: `${siteMap.base}softdev/webapps`,
      absolute: `${siteMap.origin}${siteMap.base}softdev`,
      basename: siteMap.base,
    });

    // The URL it builds really is where the file is served.
    const response = await request.get(new URL(result.asset, baseURL).href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/');
  });
});
