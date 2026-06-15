import { expect, test } from '@playwright/test';

test('public foundation page presents Zerou brand', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Organize suas finanças/i })).toBeVisible();
  await expect(page.getByText('Controle individual. Organização a dois.')).toBeVisible();
});

test('public couple invite route preserves the Zerou join flow', async ({ page }) => {
  await page.goto('/join/DUO-7X4K-92');

  await expect(page.getByRole('heading', { name: /Convite salvo para depois/i })).toBeVisible();
  await expect(page.getByText('DUO-7X4K-92')).toBeVisible();
  await expect(page.getByRole('link', { name: /Criar conta/i })).toBeVisible();
});

test('pricing page shows the Zerou plan structure', async ({ page }) => {
  await page.goto('/pricing');

  await expect(page.getByRole('heading', { name: /Escolha como organizar suas finan.as/i })).toBeVisible();
  await expect(page.getByText('Free', { exact: true })).toBeVisible();
  await expect(page.getByText('Duo', { exact: true })).toBeVisible();
  await expect(page.getByText('Premium', { exact: true })).toBeVisible();
});
