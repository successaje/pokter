import { expect, test } from '@playwright/test';

test('builders can run and switch delivery check examples in the browser', async ({ page }) => {
  await page.goto('/developers/delivery-checks');
  await expect(page.getByRole('heading', { name: 'Try a delivery check before a buyer hires' })).toBeVisible();

  await page.getByRole('button', { name: 'Run checks' }).click();
  await expect(page.getByText('The research-plan@1 checker ran with every check named in this plan.', { exact: false })).toBeVisible();
  await expect(page.getByText('4 findings each name a source.')).toBeVisible();

  await page.getByRole('button', { name: 'Trading' }).click();
  await page.getByRole('button', { name: 'Run checks' }).click();
  await expect(page.getByText('The trading-plan@1 checker ran with every check named in this plan.', { exact: false })).toBeVisible();
  await expect(page.getByText('Calculated risk 20.00 and reward 40.00 USD before fees;', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Content' }).click();
  await page.getByRole('button', { name: 'Run checks' }).click();
  await expect(page.getByText('The content-plan@1 checker ran with every check named in this plan.', { exact: false })).toBeVisible();
  await expect(page.getByText('Counted 8 words; the answer states 8.')).toBeVisible();

  await page.getByRole('button', { name: 'Load recorded Research delivery' }).click();
  await page.getByRole('button', { name: 'Run checks' }).click();
  await expect(page.getByText('The research-plan@1 checker ran with every check named in this plan.', { exact: false })).toBeVisible();
  await expect(page.getByText('It does not name the block or time its data was read at, so its figures cannot be compared with the chain later.')).toBeVisible();
  await expect(page.getByText('156 answered of 160 taken; the stated rate is 0.975.')).toBeVisible();
});
