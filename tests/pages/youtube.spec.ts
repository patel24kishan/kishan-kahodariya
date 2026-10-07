import { expect, test } from '@playwright/test';
import { youtubeEmbedUrl, youtubeVideoId } from '../../src/components/viewer/youtube';

/** Reading a video id out of the addresses the owner may paste (src/components/viewer/youtube.ts). */
const ID = 'Lp46QFgKyKM';

test.describe('youtubeVideoId', () => {
  const readable: Array<[string, string]> = [
    ['watch?v=', `https://www.youtube.com/watch?v=${ID}`],
    ['watch with more parameters', `https://www.youtube.com/watch?t=30&v=${ID}&list=PL123`],
    ['youtu.be', `https://youtu.be/${ID}`],
    ['youtu.be with a query', `https://youtu.be/${ID}?t=12`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
    ['live', `https://www.youtube.com/live/${ID}`],
    ['the old /v/ form', `https://www.youtube.com/v/${ID}`],
    ['a bare v parameter on an odd path (migrated content)', `https://www.youtube.com/Gameplay?v=${ID}`],
    ['the mobile host', `https://m.youtube.com/watch?v=${ID}`],
    ['no www', `https://youtube.com/watch?v=${ID}`],
    ['the privacy-enhanced host', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['plain http', `http://www.youtube.com/watch?v=${ID}`],
    ['surrounding whitespace', `  https://youtu.be/${ID}  `],
  ];
  for (const [label, url] of readable) {
    test(`reads the id from ${label}`, () => {
      expect(youtubeVideoId(url)).toBe(ID);
    });
  }

  const unreadable: Array<[string, string]> = [
    ['text that is not an address', 'gameplay video'],
    ['an empty string', ''],
    ['another site', 'https://helpusdefend.com/?page_id=7341'],
    ['a Vimeo address', 'https://vimeo.com/123456789'],
    ['a YouTube channel page', 'https://www.youtube.com/@someone'],
    ['a YouTube path with no id', 'https://www.youtube.com/watch'],
    ['an id of the wrong length', 'https://youtu.be/short'],
    ['a look-alike host', `https://youtube.com.example.net/watch?v=${ID}`],
    ['an id with characters YouTube never uses', 'https://www.youtube.com/watch?v=abc$def%20gh'],
    ['a javascript: address', `javascript:alert(1)//${ID}`],
  ];
  for (const [label, url] of unreadable) {
    test(`gives null for ${label}`, () => {
      expect(youtubeVideoId(url)).toBeNull();
    });
  }
});

test('youtubeEmbedUrl embeds through the privacy-enhanced host', () => {
  expect(youtubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0`);
  expect(youtubeEmbedUrl(ID, { autoplay: true })).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0&autoplay=1`);
});
