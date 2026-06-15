import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getUserFacingErrorMessage } from './userFacingError';

describe('getUserFacingErrorMessage', () => {
  it('turns zod validation errors into user-facing copy', () => {
    const schema = z.object({
      name: z.string().min(2, 'Informe o nome do cartão.'),
      lastFour: z.string().regex(/^\d{4}$/, 'Informe os 4 últimos dígitos.')
    });

    const result = schema.safeParse({ name: '', lastFour: '' });

    if (result.success) {
      throw new Error('Expected validation to fail.');
    }

    expect(getUserFacingErrorMessage(result.error, 'Falha')).toBe(
      'Revise os dados: Informe o nome do cartão. Informe os 4 últimos dígitos.'
    );
  });

  it('does not expose technical error payloads', () => {
    const technicalError = new Error('[{"code":"too_small","message":"Informe um valor."}]');

    expect(getUserFacingErrorMessage(technicalError, 'Falha')).toBe('Revise os dados: Informe um valor.');
  });
});
