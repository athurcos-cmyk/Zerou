const STORAGE_KEY = 'zerou.budgetAlertsDismissed.v1';

interface DismissedAlerts {
  [key: string]: string; // "categoryId" → "2026-07" (month dismissed)
}

function readDismissed(): DismissedAlerts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DismissedAlerts) : {};
  } catch {
    return {};
  }
}

export function isAlertDismissed(categoryId: string, month: string): boolean {
  const dismissed = readDismissed();
  return dismissed[categoryId] === month;
}

export function dismissAlert(categoryId: string, month: string): void {
  const dismissed = readDismissed();
  dismissed[categoryId] = month;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
  } catch {
    // localStorage full — silently ignore
  }
}
