import { flatText, type DeliveredAnswer } from '@/lib/delivery/answer';
import { chainLabel } from '@/lib/network/presentation';

/*
 * What an agent delivered, as the buyer's job page has always shown it:
 * the result first, when the data was read, the fields, what it does not
 * cover and where it came from. One component for the workspace, the
 * public job evidence page and the agent page's sample, so a delivery
 * reads the same wherever it is shown.
 *
 * Never the brief: `answer.asked` is not rendered here. Whoever shows
 * this decides whether the buyer's own words may be shown beside it.
 */

/** A field value as text: short values inline, structures as indented text, nothing interpreted. */
export function AnswerValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-ink-3">—</span>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return <span className="whitespace-pre-line break-words">{String(value)}</span>;
  const flat = flatText(value);
  if (flat) return <span className="break-words">{flat}</span>;
  const json = JSON.stringify(value, null, 2);
  if (json.length <= 160) return <span className="t-readout break-words text-[12.5px]">{JSON.stringify(value)}</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2 hover:text-ink">Show {Array.isArray(value) ? `${value.length} items` : 'details'}</summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-[8px] bg-sunken p-3 text-[12px]">{json.slice(0, 6000)}</pre>
    </details>
  );
}

export function DeliveredAnswerView({ answer, chainId, when }: { answer: DeliveredAnswer; chainId: number; when: (value: string) => string }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="t-label">What came back</span>
        {answer.title && <p className="text-[15px] font-semibold">{answer.title}</p>}
        {answer.result ? (
          <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-ink">{answer.result}</p>
        ) : answer.raw ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[10px] bg-sunken p-4 text-[13px]">{answer.raw.slice(0, 8000)}</pre>
        ) : (
          <p className="text-[13.5px] text-ink-3">The agent gave no summary; its fields are below.</p>
        )}
        <p className="text-[12px] text-ink-3">
          {/*
            Two facts, never one. When the report was written is not
            when its data was read, and printing the first under the
            second claimed a freshness nobody measured.
          */}
          {answer.asOf?.time ? `Data read ${when(answer.asOf.time)}` : 'The agent did not say when it read the data'}
          {answer.asOf?.block ? ` · block ${answer.asOf.block}` : ''}
          {answer.generatedAt ? ` · report generated ${when(answer.generatedAt)}` : ''}
          {` · paid on ${chainLabel(chainId)}`}
          {answer.producer ? ` · produced by ${answer.producer}` : ''}
        </p>
      </div>

      {answer.fields.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-[12px] border border-rule bg-paper p-4 text-[13.5px] sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
          {answer.fields.slice(0, 14).map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-[12.5px] capitalize text-ink-3">{f.label}</dt>
              <dd className="min-w-0 text-ink-2"><AnswerValue value={f.value} /></dd>
            </div>
          ))}
        </dl>
      )}

      {(answer.limitations.length > 0 || answer.sources.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {answer.limitations.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="t-label">What it does not cover</span>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
                {answer.limitations.slice(0, 8).map((l) => <li key={l} className="break-words">{l}</li>)}
              </ul>
            </div>
          )}
          {answer.sources.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="t-label">Where it came from</span>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
                {answer.sources.slice(0, 8).map((s) => <li key={s} className="break-all">{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="text-[12px] text-ink-3">Written by the agent. Pokter shows it as delivered and has not checked that it is right.</p>
    </>
  );
}
