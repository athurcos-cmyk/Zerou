import { expect, test } from '@playwright/test';

test('public launch page presents the canonical Zerou hero', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Seu dinheiro claro no celular\./i })).toBeVisible();
  await expect(page.getByText('Registre contas, compras, faturas e despesas a dois')).toBeVisible();
  await expect(page.getByRole('link', { name: /Começar grátis/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Ver como funciona/i })).toBeVisible();
});

test('public launch page stays light even when the device prefers dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  await expect(page.locator('.public-marketing-shell')).toHaveAttribute('data-theme', 'paper');
});

test('public pages do not block entry with a cookie banner or analytics by default', async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on('request', (request) => {
    if (/google-analytics|googletagmanager|\/g\/collect/.test(request.url())) {
      analyticsRequests.push(request.url());
    }
  });

  await page.goto('/');

  const storedConsent = await page.evaluate(() => window.localStorage.getItem('zerou.cookieConsent.v1'));
  expect(storedConsent).toBeNull();
  await expect(page.getByRole('heading', { name: /Cookies opcionais/i })).toHaveCount(0);
  expect(analyticsRequests).toEqual([]);
});

test('public couple invite route preserves the Zerou join flow', async ({ page }) => {
  await page.goto('/join/DUO-7X4K-92');

  await expect(page.getByRole('heading', { name: /Convite salvo para depois/i })).toBeVisible();
  await expect(page.getByText('DUO-7X4K-92')).toBeVisible();
  await expect(page.getByRole('link', { name: /Criar conta/i })).toBeVisible();
});

test('pricing page states the free launch mode', async ({ page }) => {
  await page.goto('/pricing');

  await expect(page.getByRole('heading', { name: /Gratuito agora/i })).toBeVisible();
  await expect(page.getByText(/100% gratuita/i)).toBeVisible();
  await expect(page.getByText('Gratuito', { exact: true })).toBeVisible();
});

test('legal pages expose launch-ready privacy text without public placeholders', async ({ page }) => {
  await page.goto('/legal/privacy');

  await expect(page.getByRole('heading', { name: /Política de privacidade/i })).toBeVisible();
  await expect(page.getByText(/Vigente desde 15\/06\/2026/i)).toBeVisible();
  await expect(page.getByText(/Direitos LGPD/i)).toBeVisible();
  await expect(page.getByText(/pendente de revisão jurídica/i)).toHaveCount(0);
  await expect(page.getByText(/\[PREENCHER/i)).toHaveCount(0);
});

test('privacy center registers that login is required for account requests', async ({ page }) => {
  await page.goto('/privacy-center');
  await page.getByRole('button', { name: /Registrar pedido/i }).first().click();

  await expect(page.getByText(/Entre na Zerou para registrar/i)).toBeVisible();
});

test('supporting public pages are not placeholders', async ({ page }) => {
  for (const route of ['/features', '/security', '/help', '/contact']) {
    await page.goto(route);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByText(/conteúdo completo entra na fase/i)).toHaveCount(0);
  }
});
