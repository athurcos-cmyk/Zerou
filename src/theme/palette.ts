// Sanctioned color-data registry (allowed to hold literals, like themes.css).
// These are persisted as values (per-category / per-goal color choices) and on-accent
// foregrounds, so they live here rather than as CSS variables.

/** White foreground used on top of accent/gradient surfaces. */
export const ACCENT_FOREGROUND = '#ffffff';

/** Sol-flavoured palette for category & goal marks — warm-leaning, readable with white text. */
export const categoryColors = [
  '#EE5524', // tangerine (Sol primary)
  '#E8911C', // amber
  '#D4A017', // gold
  '#5FA052', // green
  '#2E9E8F', // teal
  '#3B82C4', // blue
  '#6366C9', // indigo
  '#9B5DE5', // violet
  '#D6549A', // pink
  '#D14545', // red
  '#7C6F64', // taupe
  '#4A5568' // slate
];

export const defaultCategoryColor = '#7C6F64';

/** Deterministic colors for the built-in categories so they aren't all gray (no migration needed). */
export const defaultCategoryColors: Record<string, string> = {
  income_salary: '#5FA052',
  income_extra: '#2E9E8F',
  expense_home: '#3B82C4',
  expense_food: '#EE5524',
  expense_transport: '#6366C9',
  expense_health: '#D14545',
  expense_leisure: '#9B5DE5',
  both_transfer: '#4A5568',
  both_adjustment: '#7C6F64'
};
