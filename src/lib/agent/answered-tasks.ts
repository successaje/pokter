/**
 * Tasks an agent has actually answered, read from public escrow jobs.
 *
 * Sellers rarely publish example tasks, and some parse only a narrow
 * phrasing. Sluicegate answered nine one-line questions ("Where should 1000
 * USDT earn the most on BNB Chain right now, after switching costs?") and
 * returned an error for a five-line brief that held the same facts. The
 * chain already records which phrasings worked, so the hire page can offer
 * them instead of leaving the buyer to guess.
 *
 * Pure: the sweep reads deliveries and stores a verdict per job; this
 * decides what a delivery means and which tasks are worth showing.
 */

export type AnswerVerdict = 'answered' | 'unanswered' | 'pending' | 'unreadable';

/** The brief a job carries: the task field of a JSON description, or the text itself. */
export function taskFromDescription(description: string): string | null {
  const text = description.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const key of ['task', 'task_description']) {
      if (typeof parsed[key] === 'string') return (parsed[key] as string).trim() || null;
    }
    return null;
  } catch {
    return text;
  }
}

/**
 * Drops another marketplace's "via example.com" attribution tag. It is a
 * receipt marker for that marketplace, not part of what the agent was asked.
 */
export function stripMarketplaceTag(task: string): string {
  return task.replace(/,?\s*\bvia\s+(?:[a-z0-9-]+\.)+[a-z]{2,}\b\.?/gi, '').trim();
}

/** Short, plain prose a buyer can reuse; not JSON, not a wall of text. */
export function isReusableTask(task: string): boolean {
  const text = task.trim();
  if (text.length < 12 || text.length > 280) return false;
  if (/^[[{]/.test(text)) return false;
  // Something addressed to a particular wallet or position is somebody else's job.
  if (/0x[0-9a-f]{40}/i.test(text)) return false;
  return /[a-z]{3,}/i.test(text);
}

/**
 * Whether a delivered manifest is an answer, or an error dressed as one.
 *
 * Reference-pattern manifests carry the agent's output as a string in
 * `response.content`, often itself JSON. Only an object whose sole content
 * is an `error` (with or without a `need`) counts as unanswered; anything
 * with substance counts as answered. Unreadable is kept apart so it is
 * neither shown nor held against the agent.
 */
export function deliveryAnswered(manifestText: string): AnswerVerdict {
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return manifestText.trim().length >= 40 && !/^\s*error\b/i.test(manifestText) ? 'answered' : 'unreadable';
  }
  const response = (manifest as { response?: { content?: unknown } })?.response;
  const raw = response?.content ?? manifest;
  let content: unknown = raw;
  if (typeof raw === 'string') {
    try {
      content = JSON.parse(raw);
    } catch {
      return raw.trim().length >= 20 && !/^\s*(?:error|failed|unable)\b/i.test(raw) ? 'answered' : 'unanswered';
    }
  }
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const keys = Object.keys(content as Record<string, unknown>);
    if (keys.length === 0) return 'unanswered';
    if (keys.includes('error') && keys.every((key) => ['error', 'need', 'hint', 'message', 'code'].includes(key))) return 'unanswered';
    return 'answered';
  }
  return content === null || content === undefined || content === '' ? 'unanswered' : 'answered';
}

/**
 * Up to `limit` distinct answered tasks, most recent first. Tasks that
 * differ only in case, spacing or a trailing question mark count once.
 */
export function pickAnsweredTasks(
  jobs: Array<{ jobId: number; description: string; verdict: AnswerVerdict | null }>,
  limit = 3,
): string[] {
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const job of [...jobs].sort((a, b) => b.jobId - a.jobId)) {
    if (job.verdict !== 'answered') continue;
    const task = taskFromDescription(job.description);
    if (!task) continue;
    const clean = stripMarketplaceTag(task);
    if (!isReusableTask(clean)) continue;
    const key = clean.toLowerCase().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(clean);
    if (picked.length >= limit) break;
  }
  return picked;
}
