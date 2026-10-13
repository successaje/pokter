import 'server-only';

import { fetchDeclaredCapabilities } from '@/lib/agents/agent-card';
import { BRIEF_MIN, briefLongEnough } from '@/lib/hire/brief-length';
import type { ScanAgentDetail } from '@/lib/scan/types';

export { BRIEF_MIN, briefLongEnough };

/**
 * Whether a brief is substantial enough to send an agent.
 *
 * The ten-character floor exists so nobody funds escrow, or spends an
 * agent's time, on "hi". It is the wrong judge of a brief the agent
 * itself published: Pokter's evidence agent declares "56/303779" on its
 * card as how to ask it — nine characters — and three separate routes
 * rejected it, including the free trial whose whole purpose is letting
 * somebody try the agent the way it says to be tried.
 *
 * So the floor stands for free text and steps aside for a string the
 * agent wrote down. Checked against the agent's own declared examples
 * rather than a pattern, so this only ever excuses what an agent
 * actually asked for: "56/999999" is still too short, because nobody
 * published it.
 */

/** The examples an agent publishes on its card, lowercased for comparison. */
export async function declaredBriefs(agent: ScanAgentDetail): Promise<string[]> {
  const skills = await fetchDeclaredCapabilities(
    agent.services?.a2a?.endpoint ?? agent.services?.mcp?.endpoint,
    agent.token_id,
  ).catch(() => []);
  return skills.flatMap((skill) => skill.examples).map((example) => example.trim());
}

/**
 * The same question, when the caller has an agent and no card yet.
 *
 * The card is fetched only for a brief that would otherwise be refused,
 * so an ordinary brief costs nothing extra and a short one costs one
 * request to decide honestly instead of refusing on a count.
 */
export async function briefAcceptable(
  task: string,
  agent: ScanAgentDetail,
): Promise<boolean> {
  if (task.trim().length >= BRIEF_MIN) return true;
  return briefLongEnough(task, await declaredBriefs(agent));
}
