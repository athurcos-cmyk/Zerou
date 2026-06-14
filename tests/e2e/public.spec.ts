import { expect, test } from '@playwright/test';

test('public foundation page presents Zerou brand', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Organize suas finanças/i })).toBeVisible();
  await expect(page.getByText('Controle individual. Organização a dois.')).toBeVisible();
});
