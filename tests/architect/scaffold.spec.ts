import { expect, test } from '@playwright/test';

test('app shell loads under the base path', async ({ page }) => {
  const response = await page.goto('./');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('#root')).not.toBeEmpty();
});
