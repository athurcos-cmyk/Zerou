import { expect, test } from '@playwright/test';

test('public launch page presents the canonical Zerou hero', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Organize suas finanças\. Compartilhe o que faz sentido\./i })).toBeVisible();
  await expect(page.getByText('Controle sua vida financeira pessoal e do casal no mesmo app')).toBeVisible();
  await expect(page.getByRole('link', { name: /Começar grátis/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Ver como funciona/i })).toBeVisible();
});

test('cookie banner can refuse optional cookies without enabling analytics', async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on('request', (request) => {
    if (/google-analytics|googletagmanager|\/g\/collect/.test(request.url())) {
      analyticsRequests.push(request.url());
    }
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Recusar opcionais/i }).click();

  const storedConsent = await page.evaluate(() => window.localStorage.getItem('zerou.cookieConsent.v1'));
  expect(storedConsent).toContain('"analytics":false');
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

test('legal pages expose pending review placeholders', async ({ page }) => {
  await page.goto('/legal/privacy');

  await expect(page.getByRole('heading', { name: /Política de privacidade/i })).toBeVisible();
  await expect(page.getByText(/pendente de revisão jurídica/i)).toBeVisible();
  await expect(page.getByText(/\[PREENCHER controlador/i)).toBeVisible();
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
