/**
 * One reader for every A2A reply Pokter handles.
 *
 * An agent answers `message/send` with a Message (final) or a Task, whose
 * `status.state` says where the work is: submitted, working, input-required,
 * auth-required, completed, failed, canceled or rejected. The courier read
 * text from the status message and artifacts without looking at the state,
 * so "Working on it…" or a failure could be delivered as the answer; the
 * quote and notice readers looked only at `result.parts`, so a valid reply
 * wrapped in a task was missed. Here the state is read first and the
 * content second, so a reply is only ever treated as what it says it is.
 */

export type A2AState = 'completed' | 'working' | 'submitted' | 'input-required' | 'auth-required' | 'failed' | 'canceled' | 'rejected' | 'unknown';

export interface A2AReply {
  kind: 'message' | 'task' | 'error' | 'none';
  state: A2AState;
  taskId: string | null;
  /** The first non-empty data part of the result. */
  data: Record<string, unknown> | null;
  /**
   * Every non-empty data part of the result, in order. Keeping only the
   * first lost a quote an agent sent as its second part, after a summary.
   */
  dataParts: Record<string, unknown>[];
  /**
   * For a task: the data parts of its status message, whatever its state.
   * An input-required task says what it needs here, and a seller on BNB's
   * SDK can put its refusal (`response.accepted: false`, `response.reason`)
   * here; reading only a completed task's content dropped both.
   */
  statusData: Record<string, unknown>[];
  /** Text of the result. */
  texts: string[];
  /** For a task: what its status message says (progress, the input it wants, why it failed). */
  statusText: string | null;
}

const STATES = new Set<A2AState>(['completed', 'working', 'submitted', 'input-required', 'auth-required', 'failed', 'canceled', 'rejected']);

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function partsOf(source: Record<string, unknown> | null): unknown[] {
  return source && Array.isArray(source.parts) ? source.parts : [];
}

function collect(parts: unknown[]): { data: Record<string, unknown> | null; dataParts: Record<string, unknown>[]; texts: string[] } {
  const dataParts: Record<string, unknown>[] = [];
  const texts: string[] = [];
  for (const entry of parts) {
    const part = object(entry);
    if (!part) continue;
    if (typeof part.text === 'string' && part.text.trim()) texts.push(part.text.trim());
    const candidate = object(part.data);
    if (candidate && Object.keys(candidate).length > 0) dataParts.push(candidate);
  }
  return { data: dataParts[0] ?? null, dataParts, texts };
}

const NONE: A2AReply = { kind: 'none', state: 'unknown', taskId: null, data: null, dataParts: [], statusData: [], texts: [], statusText: null };

export function readA2AReply(payload: unknown): A2AReply {
  const root = object(payload);
  if (!root) return NONE;
  if (root.error) {
    const message = object(root.error)?.message;
    return { ...NONE, kind: 'error', state: 'failed', statusText: typeof message === 'string' ? message : null };
  }
  const result = object(root.result);
  if (!result) return NONE;

  const status = object(result.status);
  const isTask = result.kind === 'task' || (status !== null && typeof status.state === 'string');
  if (!isTask) {
    // A Message is the agent's final word.
    const { data, dataParts, texts } = collect(partsOf(result));
    return { kind: 'message', state: 'completed', taskId: null, data, dataParts, statusData: [], texts, statusText: null };
  }

  const raw = typeof status?.state === 'string' ? status.state.toLowerCase() : '';
  const state = (STATES.has(raw as A2AState) ? raw : 'unknown') as A2AState;
  const statusParts = collect(partsOf(object(status?.message)));
  const artifactParts = (Array.isArray(result.artifacts) ? result.artifacts : []).flatMap((artifact) => partsOf(object(artifact)));
  const fromArtifacts = collect(artifactParts);
  // A completed task's result is its artifacts; the status message is the fallback.
  const content = state === 'completed' && (fromArtifacts.data || fromArtifacts.texts.length) ? fromArtifacts : state === 'completed' ? statusParts : { data: null, dataParts: [], texts: [] };
  return {
    kind: 'task',
    state,
    taskId: typeof result.id === 'string' ? result.id : null,
    data: content.data,
    dataParts: content.dataParts,
    statusData: statusParts.dataParts,
    texts: content.texts,
    statusText: statusParts.texts.join(' ') || null,
  };
}

/** Why a reply is not an answer yet, in words, or null when it is one. */
export function notAnAnswer(reply: A2AReply): string | null {
  if (reply.kind === 'error') return `The agent returned an error${reply.statusText ? `: ${reply.statusText}` : ''}.`;
  if (reply.kind !== 'task' || reply.state === 'completed') return null;
  const said = reply.statusText ? ` It said: “${reply.statusText.slice(0, 300)}”` : '';
  if (reply.state === 'working' || reply.state === 'submitted') return `The agent accepted the task and is still working on it${reply.taskId ? ` (task ${reply.taskId})` : ''}; Pokter does not follow long-running tasks yet, so nothing was delivered.${said}`;
  if (reply.state === 'input-required' || reply.state === 'auth-required') return `The agent needs more ${reply.state === 'auth-required' ? 'authorisation' : 'input'} before it can answer.${said}`;
  if (reply.state === 'failed' || reply.state === 'rejected' || reply.state === 'canceled') return `The agent reported the task ${reply.state}.${said}`;
  return `The agent replied with a task in an unknown state.${said}`;
}
