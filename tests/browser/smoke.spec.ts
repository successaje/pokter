import { expect, test } from '@playwright/test';

/*
 * The harness itself: the test server answers, a public page renders with
 * its content, and the browser reports no error while it does.
 */
test('the methodology page renders without a browser error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/methodology');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('@after-deadline the server clock moves when the run asks it to', async ({ page }) => {
  // The page reads the server's clock: after the deadline it renders its closed state.
  await page.goto('/set-and-earn');
  await expect(page.getByText('Set and Earn has closed')).toBeVisible();
});
