const secretPatterns = [
  /sk_(live|test)_[A-Za-z0-9_]+/g,
  /rk_(live|test)_[A-Za-z0-9_]+/g,
  /whsec_[A-Za-z0-9_]+/g
];

export function redactError(error: unknown) {
  const originalMessage = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : 'unknown';
  const message = secretPatterns.reduce((text, pattern) => text.replace(pattern, '[redacted]'), originalMessage);

  return {
    code,
    message: message.slice(0, 500)
  };
}

