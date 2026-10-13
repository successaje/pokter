/**
 * Whether a brief is substantial enough to send an agent.
 *
 * The ten-character floor exists so nobody funds escrow, or spends an
 * agent's time, on "hi". It is the wrong judge of a brief the agent
 * itself published: Pokter's evidence agent declares "56/303779" on its
 * card as how to ask it — nine characters — and three separate routes
 * rejected it, including the free trial whose whole purpose is letting
 * somebody try an agent the way it says to be tried.
 *
 * So the floor stands for free text and steps aside for a string the
 * agent wrote down. Checked against that agent's own declared examples
 * rather than a pattern, so it only ever excuses what an agent actually
 * asked for.
 *
 * Pure, and kept out of `brief.ts`, which is `server-only` and so cannot
 * be imported by a test.
 */

export const BRIEF_MIN = 10;

export function briefLongEnough(task: string, declared: readonly string[]): boolean {
  const trimmed = task.trim();
  if (trimmed.length >= BRIEF_MIN) return true;
  if (trimmed.length === 0) return false;
  return declared.some((example) => example.trim().toLowerCase() === trimmed.toLowerCase());
}
