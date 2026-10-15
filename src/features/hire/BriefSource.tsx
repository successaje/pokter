'use client';

import { useState } from 'react';

import { withOwnWallet, type BriefSource } from '@/lib/hire/taskTemplates';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';

interface PreviewResult {
  state?: string;
  answer?: string | null;
  truncated?: boolean;
  status?: string | null;
  latencyMs?: number;
  error?: string;
}

/**
 * Says where the brief below comes from when it is not the agent's own.
 *
 * With nothing declared, the templates are Pokter's generic wording and
 * the buyer is told so, rather than left to read them as formats the agent
 * supports. With a free preview declared, its format is shown as the
 * preview's and the buyer can run it, free, on the brief they have written:
 * the answer shows what the agent made of it before anything is paid.
 */
export function BriefSourceNotice({
  source,
  agentName,
  chainId,
  tokenId,
  task,
  preview,
  wallet,
  onUseExample,
}: {
  source: BriefSource;
  agentName: string;
  chainId: number;
  tokenId: string;
  task: string;
  preview: { name: string; description?: string | null; examples: readonly string[] } | null;
  /** The connected wallet, put in place of an example's wallet placeholder. */
  wallet: string | null;
  onUseExample: (example: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  if (source === 'declared') return null;

  if (source === 'unknown' || !preview) {
    return (
      <Notice title={`${agentName} does not say what its paid job accepts`}>
        Its card publishes no example request, so the wording below is Pokter’s generic template, not a format this agent is
        known to support. If it cannot use the brief it declines to quote, and nothing is paid.
      </Notice>
    );
  }

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch('/api/hire/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId, tokenId, task }),
      });
      setResult((await response.json().catch(() => ({ error: 'The preview returned no readable answer.' }))) as PreviewResult);
    } catch {
      setResult({ error: 'The preview could not be reached. Try again shortly.' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Notice title={`${agentName} documents a free preview, not its paid job`}>
      <div className="flex flex-col gap-2.5">
        <p>
          Its card does not say what the paid job accepts. It does describe a free preview, “{preview.name}”, which runs outside
          escrow. Its format is a hint, not a promise about the paid job.
        </p>
        {preview.description && <p className="text-ink-3">{preview.description}</p>}
        {preview.examples.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-3">Its example:</span>
            {preview.examples.map((example) => (
              <button key={example} type="button" onClick={() => onUseExample(withOwnWallet(example, wallet))} className="t-readout rounded-[8px] border border-rule bg-paper px-2 py-1 text-[12.5px] hover:border-rule-strong">
                {example}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="s" intent="secondary" onClick={run} disabled={running || !task.trim()}>
            {running ? 'Running the preview…' : 'Try this brief in the free preview'}
          </Button>
          <span className="text-[12px] text-ink-3">No payment, no signature, no job.</span>
        </div>
        {result && (
          <div aria-live="polite" className="flex flex-col gap-1.5">
            {result.error ? (
              <p className="text-bad">{result.error}</p>
            ) : result.answer ? (
              <>
                <span className="text-[12px] text-ink-3">
                  The preview’s answer{result.latencyMs ? `, in ${(result.latencyMs / 1000).toFixed(1)}s` : ''}. It shows what the agent
                  understood, not what the paid job delivers.
                </span>
                <pre className="t-readout max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[8px] border border-rule bg-paper p-3 text-[12px]">
                  {result.answer}
                  {result.truncated ? '\n…' : ''}
                </pre>
              </>
            ) : (
              <p className="text-ink-3">
                The preview did not return an answer (state: {result.state ?? 'unknown'}){result.status ? `: “${result.status}”` : '.'}
              </p>
            )}
          </div>
        )}
      </div>
    </Notice>
  );
}
