import { expect, test, type Page } from '@playwright/test';

/*
 * Set and Earn around its deadline, 5 November 2026 12:00 UTC.
 *
 * The server renders the campaign while it is live, but the page a visitor
 * sees can be older than that answer: cached, restored, or left open across
 * the deadline. These run the browser's clock to each side of the moment and
 * check what is on screen. The deadline itself still counts as live; one
 * millisecond after, nothing may say the campaign is on.
 */

const END = Date.parse('2026-11-05T12:00:00Z');
const bar = (page: Page) => page.locator('#campaign-bar');
const homeCampaign = (page: Page) => page.locator('section[data-campaign-live]');

test.describe('while the server says the campaign is live', () => {
  test.setTimeout(120_000);

  test('the strip names every requirement: register, three agents, two marketplaces, one build', async ({ page }) => {
    await page.clock.install({ time: END - 86_400_000 });
    await page.goto('/methodology');
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText('Set and Earn is live.');
    await expect(bar(page)).toContainText('Register first, hire three different agents across at least two marketplaces, and build one agent of your own.');
    await expect(bar(page)).toContainText('Ends 5 Nov · 12:00 UTC');
  });

  test('a page opened at the deadline itself still shows the campaign', async ({ page }) => {
    // Held at the exact millisecond, so loading the page does not carry it past.
    await page.clock.install({ time: END - 10_000 });
    await page.clock.pauseAt(END);
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    await expect(homeCampaign(page)).toBeVisible();
  });

  test('a page rendered before the deadline and opened just after it shows no campaign', async ({ page }) => {
    await page.clock.install({ time: END + 1 });
    await page.goto('/');
    // Still in the server's HTML: the browser is what hides them.
    await expect(bar(page)).toHaveCount(1);
    await expect(homeCampaign(page)).toHaveCount(1);
    await expect(bar(page)).toBeHidden();
    await expect(homeCampaign(page)).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-campaign', 'closed');
  });

  test('a page left open across the deadline closes the campaign when it passes', async ({ page }) => {
    await page.clock.install({ time: END - 3_000 });
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    await expect(homeCampaign(page)).toBeVisible();
    await page.clock.runFor(5_000);
    await expect(bar(page)).toBeHidden();
    await expect(homeCampaign(page)).toBeHidden();
  });

  test('a page whose timer slept through the deadline closes when it is looked at again', async ({ page }) => {
    await page.clock.install({ time: END - 60 * 60_000 });
    await page.goto('/methodology');
    await expect(bar(page)).toBeVisible();
    // A laptop lid closed for two hours: the clock jumps, and no timer fires. Opening it focuses the page.
    await page.clock.setSystemTime(END + 60 * 60_000);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(bar(page)).toBeHidden();
  });

  test('a dismissed strip stays hidden after a reload, and the home section stays', async ({ page }) => {
    await page.clock.install({ time: END - 86_400_000 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Hide the Set and Earn notice' }).click();
    await expect(bar(page)).toBeHidden();
    await page.reload();
    await expect(bar(page)).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-campaign-bar', 'hidden');
    // Dismissing the strip is not the campaign closing.
    await expect(homeCampaign(page)).toBeVisible();
  });
});

test.describe('@after-deadline once the server is past the deadline', () => {
  test.setTimeout(120_000);

  test('the guide says entries closed, when winners come, and where to check hires', async ({ page }) => {
    await page.goto('/set-and-earn');
    const notice = page.getByRole('status').filter({ hasText: 'Set and Earn has closed' });
    await expect(notice).toContainText('Entries closed on 5 November, 12:00 UTC.');
    await expect(notice).toContainText('announces winners after 13 November');
    await expect(page.getByText('get a reminder before time runs out')).toHaveCount(0);
    await expect(page.getByText('Closed', { exact: true })).toBeVisible();
    await notice.getByRole('link', { name: 'Check a wallet’s hires' }).click();
    await expect(page).toHaveURL(/\/quest$/);
  });

  test('the tracker says it closed, and still looks a wallet up', async ({ page }) => {
    await page.goto('/quest');
    await expect(page.getByText('BNB Chain · Set and Earn · Closed 5 Nov · 12:00 UTC')).toBeVisible();
    const notice = page.getByRole('status').filter({ hasText: 'Set and Earn has closed' });
    await expect(notice).toContainText('a hire made after the deadline also appears here and does not count');

    await page.getByRole('textbox', { name: 'Wallet address' }).fill('0x00000000000000000000000000000000000000a1');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page).toHaveURL(/address=0x0{38}a1/);
    await expect(page.getByText('0 of 3 different agents hired')).toBeVisible();
  });

  test('no page renders the strip or the home campaign section', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    // The landing headline, not an error page's heading.
    await expect(page.locator('h1.t-display')).toBeVisible();
    expect(errors).toEqual([]);
    await expect(bar(page)).toHaveCount(0);
    await expect(homeCampaign(page)).toHaveCount(0);
  });
});
