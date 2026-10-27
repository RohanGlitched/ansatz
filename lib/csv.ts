/**
 * One CSV cell. Text that a spreadsheet would read as a formula (it starts with = + - @ tab or CR) is
 * prefixed with a single quote, so a student name like `=HYPERLINK(...)` opens as text. Quoted when it
 * holds a comma, quote or line break.
 */
export function csvText(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A numeric cell: written as it is (a leading minus is a number, not a formula). */
export function csvNum(s: string): string {
  return /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s) || s === "" ? s : csvText(s);
}
