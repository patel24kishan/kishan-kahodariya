import { expect, test } from '@playwright/test';
import {
  itemRefOf,
  parseViewerSearch,
  resolveItemIndex,
  viewerItems,
  withViewerSearch,
} from '../../src/components/viewer/viewerState';

/** The viewer's address state and item strip (src/components/viewer/viewerState.ts). */

test.describe('parseViewerSearch', () => {
  test('reads the project and a screenshot number', () => {
    expect(parseViewerSearch('?view=scarfall&item=2')).toEqual({ slug: 'scarfall', item: { kind: 'screenshot', index: 1 } });
  });

  test('reads the video item', () => {
    expect(parseViewerSearch('?view=tank-it&item=video')).toEqual({ slug: 'tank-it', item: { kind: 'video' } });
  });

  test('a missing or meaningless item means "the default item"', () => {
    expect(parseViewerSearch('?view=scarfall')).toEqual({ slug: 'scarfall', item: null });
    expect(parseViewerSearch('?view=scarfall&item=0')).toEqual({ slug: 'scarfall', item: null });
    expect(parseViewerSearch('?view=scarfall&item=abc')).toEqual({ slug: 'scarfall', item: null });
  });

  test('no view parameter means the viewer is closed', () => {
    expect(parseViewerSearch('')).toBeNull();
    expect(parseViewerSearch('?item=2')).toBeNull();
    expect(parseViewerSearch('?view=')).toBeNull();
    expect(parseViewerSearch('?ref=x')).toBeNull();
  });
});

test.describe('withViewerSearch', () => {
  test('writes the request and keeps other parameters', () => {
    expect(withViewerSearch('?ref=x', { slug: 'scarfall', item: { kind: 'screenshot', index: 0 } })).toBe('?ref=x&view=scarfall&item=1');
    expect(withViewerSearch('', { slug: 'tank-it', item: { kind: 'video' } })).toBe('?view=tank-it&item=video');
    expect(withViewerSearch('', { slug: 'tank-it', item: null })).toBe('?view=tank-it');
  });

  test('replaces an earlier request and removes it on close', () => {
    expect(withViewerSearch('?view=a&item=3', { slug: 'b', item: { kind: 'video' } })).toBe('?view=b&item=video');
    expect(withViewerSearch('?ref=x&view=a&item=3', null)).toBe('?ref=x');
    expect(withViewerSearch('?view=a&item=3', null)).toBe('');
  });

  test('round-trips through parseViewerSearch', () => {
    const request = { slug: 'quest-raider', item: { kind: 'screenshot' as const, index: 4 } };
    expect(parseViewerSearch(withViewerSearch('', request))).toEqual(request);
  });
});

test.describe('viewerItems and resolveItemIndex', () => {
  const project = {
    videoUrl: 'https://youtu.be/QlD0JzGOHkk',
    screenshots: [
      { src: '/uploads/a.png', alt: 'A' },
      { src: '/uploads/b.png', alt: 'B' },
    ],
  };

  test('the video comes first, then the screenshots in order', () => {
    const items = viewerItems(project);
    expect(items.map((item) => item.kind)).toEqual(['video', 'screenshot', 'screenshot']);
    expect(items[0]).toMatchObject({ kind: 'video', videoId: 'QlD0JzGOHkk' });
    expect(items[2]).toMatchObject({ kind: 'screenshot', index: 1, src: '/uploads/b.png', alt: 'B' });
  });

  test('an unreadable video address keeps the item with a null id', () => {
    const items = viewerItems({ videoUrl: 'https://example.com/clip', screenshots: [] });
    expect(items).toEqual([{ kind: 'video', key: 'video', url: 'https://example.com/clip', videoId: null }]);
  });

  test('no video, no video item; blank video addresses count as none', () => {
    expect(viewerItems({ videoUrl: '   ', screenshots: project.screenshots }).map((item) => item.kind)).toEqual(['screenshot', 'screenshot']);
  });

  test('resolves a request to a strip index, defaulting to the first screenshot', () => {
    const items = viewerItems(project);
    expect(resolveItemIndex(items, { kind: 'video' })).toBe(0);
    expect(resolveItemIndex(items, { kind: 'screenshot', index: 1 })).toBe(2);
    expect(resolveItemIndex(items, { kind: 'screenshot', index: 9 })).toBe(1);
    expect(resolveItemIndex(items, null)).toBe(1);
    expect(resolveItemIndex(viewerItems({ videoUrl: project.videoUrl, screenshots: [] }), null)).toBe(0);
    expect(resolveItemIndex([], null)).toBe(-1);
  });

  test('itemRefOf inverts the strip', () => {
    const items = viewerItems(project);
    expect(items.map(itemRefOf)).toEqual([{ kind: 'video' }, { kind: 'screenshot', index: 0 }, { kind: 'screenshot', index: 1 }]);
  });
});
