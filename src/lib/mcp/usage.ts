/**
 * Which MCP tools assistants actually call, read off a request and its answer.
 *
 * The listing in the MCP Registry is the first route to Pokter where the
 * buyer never visits the site: an assistant reads the catalogue, prices a
 * brief and prepares a hire, and the only trace is a POST. The browser
 * funnel cannot see any of it — `ConversionBeacon` runs in a page, and
 * there is no page — so without this the question "is the new channel
 * used" has no answer at all, and would still have none in a month.
 *
 * Counts only, per tool and day, like the conversion funnel: no brief, no
 * arguments, no wallet, no caller, no exact time. What a stranger asked an
 * agent for is theirs, and an answer to "did anyone call search_agents
 * today" does not need it.
 *
 * Deriving the pairs here rather than inside the dispatcher keeps the
 * recording at the edge, where a route already has both halves, and keeps
 * this testable without a database or a server.
 */

/** The two servers: the open buying surface, and the one agent owners use. */
export const MCP_SURFACES = ['buyer', 'provider'] as const;
export type McpSurface = (typeof MCP_SURFACES)[number];

/** One tool call, and whether the caller got an answer or an error. */
export interface McpCall {
  tool: string;
  ok: boolean;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** JSON-RPC allows a string or a number, and a batch may mix them. */
function idOf(message: Record<string, unknown>): string | null {
  const id = message.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

/**
 * The tool calls in a request, paired with how each one came back.
 *
 * A batch is answered as an array, and the spec does not promise the
 * answers arrive in the order they were asked, so they are matched by id
 * rather than by position. A notification carries no id and gets no
 * answer; it is counted as made, because it was.
 *
 * `isError: true` is how a tool reports that the work failed while the
 * call itself succeeded — an agent that would not quote, a job that does
 * not exist. That is a failed call for this purpose: the assistant did
 * not get what it asked for.
 */
export function callsIn(body: unknown, answer: unknown): McpCall[] {
  const messages = (Array.isArray(body) ? body : [body]).map(asObject).filter((m): m is Record<string, unknown> => m !== null);
  const answers = (Array.isArray(answer) ? answer : [answer]).map(asObject).filter((a): a is Record<string, unknown> => a !== null);
  const byId = new Map(answers.flatMap((a) => { const id = idOf(a); return id === null ? [] : [[id, a] as const]; }));

  return messages.flatMap((message) => {
    if (message.method !== 'tools/call') return [];
    const name = asObject(message.params)?.name;
    if (typeof name !== 'string' || name === '') return [];
    const id = idOf(message);
    /* No id is a notification: nothing comes back, and nothing failed. */
    const reply = id === null ? null : byId.get(id);
    const failed = reply !== undefined && reply !== null && (reply.error !== undefined || asObject(reply.result)?.isError === true);
    return [{ tool: name, ok: !failed }];
  });
}
