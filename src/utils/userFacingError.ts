import { ZodError, type ZodIssue } from 'zod';

const technicalFragments = ['too_small', 'invalid_format', 'invalid_type', '[{', '"code"', '"path"', 'FirebaseError'];

function normalizeZodMessage(issue: ZodIssue) {
  return issue.message.endsWith('.') ? issue.message : `${issue.message}.`;
}

function messageFromIssues(issues: ZodIssue[]) {
  const messages = [...new Set(issues.map(normalizeZodMessage))];

  if (messages.length === 0) {
    return null;
  }

  return `Revise os dados: ${messages.join(' ')}`;
}

function parseZodMessage(message: string) {
  try {
    const parsed = JSON.parse(message) as unknown;

    if (!Array.isArray(parsed)) {
      return null;
    }

    const messages = parsed
      .map((item) => {
        if (typeof item === 'object' && item && 'message' in item && typeof item.message === 'string') {
          return item.message.endsWith('.') ? item.message : `${item.message}.`;
        }

        return null;
      })
      .filter((item): item is string => Boolean(item));

    return messages.length ? `Revise os dados: ${[...new Set(messages)].join(' ')}` : null;
  } catch {
    return null;
  }
}

export function getUserFacingErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ZodError) {
    return messageFromIssues(error.issues) ?? fallback;
  }

  if (error instanceof Error) {
    const parsed = parseZodMessage(error.message);

    if (parsed) {
      return parsed;
    }

    if (technicalFragments.some((fragment) => error.message.includes(fragment))) {
      return fallback;
    }

    return error.message || fallback;
  }

  return fallback;
}
