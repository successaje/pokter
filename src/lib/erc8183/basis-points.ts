/** "0%", "0.5%", "10%": basis points (100 is 1%) as a percentage, without trailing zeros. */
export function percentOf(bp: number): string {
  return `${Number((bp / 100).toFixed(2))}%`;
}
