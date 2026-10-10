/** Money and weight rounding shared by Adagu and Gold Savings maths. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000
}
