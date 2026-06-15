import { expect, test } from '@playwright/test';

test('public launch page presents the Zerou mobile-first finance promise', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Seu dinheiro simples de entender\./i })).toBeVisible();
  await expect(page.getByText(/Acompanhe gastos, contas, cart(ões|oes) e combinados do casal/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Come(ç|c)ar agora/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Ver funcionalidades/i })).toBeVisible();
  await expect(page.getByText(/Funcionalidades Zerou/i)).toHaveCount(0);
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

test('public navigation does not expose plans or standalone legal clutter', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: /Navegacao publica|Navegação pública/i }).getByText(/Planos/i)).toHaveCount(0);
  await expect(page.getByText(/Subprocessadores/i)).toHaveCount(0);
  await expect(page.getByText(/^Cookies$/i)).toHaveCount(0);
  await expect(page.getByText(/Centro de privacidade/i)).toHaveCount(0);
  await expect(page.getByText(/Ja posso usar em producao|Já posso usar em produção/i)).toHaveCount(0);
  await expect(page.getByText(/O app esta pago|O app está pago/i)).toHaveCount(0);
});

test('pricing and standalone legal legacy routes redirect to the right public pages', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /Seu dinheiro simples de entender\./i })).toBeVisible();

  await page.goto('/legal/subprocessors');
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await expect(page.getByRole('heading', { name: /Politica de privacidade|Política de privacidade/i })).toBeVisible();

  await page.goto('/legal/cookies');
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await expect(page.getByText(/Cookies e armazenamento local/i)).toBeVisible();
});

test('public couple invite route preserves the Zerou join flow', async ({ page }) => {
  await page.goto('/join/DUO-7X4K-92');

  await expect(page.getByRole('heading', { name: /Convite salvo para depois/i })).toBeVisible();
  await expect(page.getByText('DUO-7X4K-92')).toBeVisible();
  await expect(page.getByRole('link', { name: /Criar conta/i })).toBeVisible();
});

test('shared space creation is not available without login', async ({ page }) => {
  await page.goto('/app/shared');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: /Volte para o seu espaco Zerou|Volte para o seu espaço Zerou/i })).toBeVisible();
  await expect(page.getByText(/Criar espaco compartilhado|Criar espaço compartilhado/i)).toHaveCount(0);
});

test('legal pages expose stronger Brazilian privacy text without public placeholders', async ({ page }) => {
  await page.goto('/legal/privacy');

  await expect(page.getByRole('heading', { name: /Politica de privacidade|Política de privacidade/i })).toBeVisible();
  await expect(page.getByText(/Atualizado em 15\/06\/2026/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Fornecedores tecnicos|Fornecedores técnicos/i })).toBeVisible();
  await expect(page.getByText(/Firebase e Google Cloud/i)).toBeVisible();
  await expect(page.getByText(/Vercel/i)).toBeVisible();
  await expect(page.getByText(/pendente de revisao juridica|pendente de revisão jurídica/i)).toHaveCount(0);
  await expect(page.getByText(/\[PREENCHER/i)).toHaveCount(0);
});

test('privacy page is informational, not a protocol request wall', async ({ page }) => {
  await page.goto('/privacy-center');

  await expect(page.getByRole('heading', { name: /Seu espaco pessoal continua seu|Seu espaço pessoal continua seu/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Registrar pedido/i })).toHaveCount(0);
  await expect(page.getByText(/Revogar marketing/i)).toHaveCount(0);
  await expect(page.getByText(/Solicitar exclusao|Solicitar exclusão/i)).toHaveCount(0);
  await expect(page.getByText(/Remover cache local/i)).toHaveCount(0);
});

test('supporting public pages are not placeholders', async ({ page }) => {
  for (const route of ['/features', '/security', '/help', '/contact']) {
    await page.goto(route);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByText(/conteudo completo entra na fase|conteúdo completo entra na fase/i)).toHaveCount(0);
    await expect(page.getByText(/antes de producao|antes de produção/i)).toHaveCount(0);
  }
});
