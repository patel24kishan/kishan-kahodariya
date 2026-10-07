/**
 * Lets a dev-server test run the REAL page over slightly different content, without touching
 * a file under /content.
 *
 * The app reads its content from the module "virtual:content", which the dev server sends as
 * `export default <json>;` (scripts/lib/content-plugin.ts). overrideContent() answers that one
 * request itself: it takes the server's module, hands the parsed content to `change`, and
 * sends the changed content back in the same form. Everything else (the router, the page,
 * the selectors in @/content) is the real thing. Dev suite only: a build has the content
 * compiled into its bundle.
 *
 * Call it before the page is opened.
 */
import type { Page } from '@playwright/test';
import type { ContentBundle } from '../../../src/content/bundle';

const CONTENT_MODULE = 'virtual:content';
const MODULE_FORM = /^export default (\{.*\});?$/;

export async function overrideContent(page: Page, change: (content: ContentBundle) => void): Promise<void> {
  await page.route(
    (url) => decodeURIComponent(url.pathname).includes(CONTENT_MODULE),
    async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      // The data is the first line; a source-map comment may follow it.
      const [first = '', ...rest] = source.split('\n');
      const match = MODULE_FORM.exec(first.trim());
      if (!match?.[1]) {
        throw new Error(`The dev server's "${CONTENT_MODULE}" module is not "export default {…};" any more; overrideContent() must be updated. It starts with: ${source.slice(0, 80)}`);
      }
      const content = JSON.parse(match[1]) as ContentBundle;
      change(content);
      const body = [`export default ${JSON.stringify(content)};`, ...rest.filter((line) => !line.startsWith('//# sourceMappingURL'))].join('\n');
      await route.fulfill({ response, body });
    },
  );
}
