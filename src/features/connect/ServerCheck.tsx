'use client';

import { useState } from 'react';

import { Button } from '@/ui/Button';
import { Icon } from '@/ui/icons';

type State = { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok'; tools: string[]; ms: number } | { kind: 'failed'; reason: string };

/**
 * Asks Pokter's MCP server for its tools, from this browser, the way an
 * assistant would. It proves the server answers; it cannot see inside the
 * reader's assistant, and says so.
 */
export function ServerCheck({ endpoint }: { endpoint: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const run = async () => {
    setState({ kind: 'checking' });
    const started = performance.now();
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => null)) as { result?: { tools?: Array<{ name: string }> }; error?: { message?: string } } | null;
      if (!response.ok || !body?.result?.tools) {
        setState({ kind: 'failed', reason: body?.error?.message ?? `The server answered HTTP ${response.status}.` });
        return;
      }
      setState({ kind: 'ok', tools: body.result.tools.map((t) => t.name), ms: Math.round(performance.now() - started) });
    } catch (error) {
      setState({ kind: 'failed', reason: error instanceof Error && error.name === 'TimeoutError' ? 'No answer within 15 seconds.' : 'The request did not complete. Check your connection and try again.' });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button intent="secondary" size="s" className="self-start" onClick={() => void run()} busy={state.kind === 'checking'} icon={<Icon.Play size={13} />}>
        {state.kind === 'failed' ? 'Try again' : 'Check the server answers'}
      </Button>
      <p role="status" aria-live="polite" className="text-[13px]">
        {state.kind === 'checking' && <span className="text-ink-3">Asking the server for its tools…</span>}
        {state.kind === 'ok' && (
          <span className="text-ok">
            It answered in {state.ms} ms with {state.tools.length} tools: <span className="t-readout text-ink-2">{state.tools.join(', ')}</span>.
          </span>
        )}
        {state.kind === 'failed' && <span className="text-bad">{state.reason}</span>}
      </p>
    </div>
  );
}
