/**
 * The line under a card's settled count, or null.
 *
 * Only the exception is said: settled work Pokter's own wallets paid for,
 * so a record of Pokter's tests is not read as demand. A count of outside
 * buyers on every card mostly repeated the figure above it, and "outside"
 * is easily read as hired elsewhere.
 */
export function teamFundedNote(paid: { completed: number; teamCompleted: number }): string | null {
  if (paid.completed === 0 || paid.teamCompleted === 0) return null;
  if (paid.teamCompleted >= paid.completed) return paid.completed === 1 ? 'funded by Pokter' : 'all funded by Pokter';
  return `${paid.teamCompleted} funded by Pokter`;
}
