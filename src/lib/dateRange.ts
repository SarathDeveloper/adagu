/**
 * Small ISO date-range helpers shared by the list and dashboard screens.
 * Dates are always ISO `YYYY-MM-DD`; see the date-format rule.
 */
export function monthRange(today: string): { from: string; to: string } {
  const [year, month] = today.split('-')
  const lastDay = new Date(Number(year), Number(month), 0).getDate()
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function dateInRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!value) {
    return false
  }
  const key = value.slice(0, 10)
  return key >= from && key <= to
}
