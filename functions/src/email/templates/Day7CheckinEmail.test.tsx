import { describe, expect, it } from 'vitest';
import { render } from '@react-email/render';
import { Day7CheckinEmail } from './Day7CheckinEmail.js';

describe('Day7CheckinEmail', () => {
  it('nudges to start when the person has not activated', async () => {
    const html = await render(Day7CheckinEmail({ name: 'Ana', activated: false }));
    expect(html).toContain('Posso te ajudar a começar');
    expect(html).toContain('WhatsApp');
  });

  it('offers a deeper tip when the person already activated', async () => {
    const html = await render(Day7CheckinEmail({ name: 'Ana', activated: true }));
    expect(html).toContain('Uma dica pra ir além');
    expect(html).toContain('cartão de crédito');
  });
});
