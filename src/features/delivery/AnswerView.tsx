import { shapeIsBlock, shapeLines, valueShape, type DeliveredAnswer, type ValueShape } from '@/lib/delivery/answer';
import { chainLabel } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

/*
 * What an agent delivered: its judgement and why first, what it does not
 * cover, when the data was read, then the data behind it and where it
 * came from. One component for the workspace, the
 * public job evidence page and the agent page's sample, so a delivery
 * reads the same wherever it is shown.
 *
 * Never the brief: `answer.asked` is not rendered here. Whoever shows
 * this decides whether the buyer's own words may be shown beside it.
 */

/** Past this many lines a value is folded, so one field never buries the rest. */
const FOLD_AFTER = 6;

/** A field value as the agent wrote it: short values inline, structures as rows and tables, nothing interpreted. */
export function AnswerValue({ value }: { value: unknown }) {
  const shape = valueShape(value);
  if (shapeLines(shape) <= FOLD_AFTER) return <Shape shape={shape} />;
  return (
    <details className="group">
      <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2 hover:text-ink">Show {Array.isArray(value) ? `${value.length} items` : 'details'}</summary>
      <div className="mt-2">
        <Shape shape={shape} />
      </div>
    </details>
  );
}

function More({ count }: { count: number }) {
  return count > 0 ? <p className="text-[12.5px] text-ink-3">and {count} more</p> : null;
}

function Shape({ shape }: { shape: ValueShape }) {
  switch (shape.kind) {
    case 'empty':
      return <span className="text-ink-3">—</span>;
    case 'text':
      return <span className="whitespace-pre-line break-words">{shape.text}</span>;
    case 'json':
      return <span className="t-readout break-words text-[12.5px]">{shape.text}</span>;
    case 'rows':
      return (
        <>
          <dl className="flex flex-col gap-1">
            {shape.rows.map((row, i) => (
              <div key={`${i}:${row.label}`} className="flex flex-wrap gap-x-2">
                <dt className="text-ink-3">{row.label}</dt>
                <dd className={shapeIsBlock(row.value) ? 'mt-0.5 w-full border-l border-rule pl-3' : 'min-w-0 break-words'}>
                  <Shape shape={row.value} />
                </dd>
              </div>
            ))}
          </dl>
          <More count={shape.more} />
        </>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="text-[12.5px] tabular-nums">
            <thead>
              <tr>
                {shape.columns.map((column) => (
                  <th key={column} scope="col" className="pb-1 pr-4 text-left font-normal text-ink-3">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shape.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((value, j) => (
                    <td key={j} className="py-0.5 pr-4 align-top">{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <More count={shape.more} />
        </div>
      );
    case 'list':
      return (
        <>
          <ol className="flex flex-col gap-2">
            {shape.items.map((item, i) => (
              <li key={i} className="border-l border-rule pl-3">
                <Shape shape={item} />
              </li>
            ))}
          </ol>
          <More count={shape.more} />
        </>
      );
  }
}

const TONE: Record<'ok' | 'watch' | 'bad', { mark: React.ReactNode; said: string; text: string; wash: string }> = {
  ok: { mark: <Icon.Check size={14} />, said: 'Fine', text: 'text-ok', wash: 'bg-ok-wash' },
  watch: { mark: <Icon.Alert size={14} />, said: 'Caution', text: 'text-watch', wash: 'bg-watch-wash' },
  bad: { mark: <Icon.Cross size={14} />, said: 'Problem', text: 'text-bad', wash: 'bg-bad-wash' },
};

/*
 * The order a buyer reads in: the agent's judgement, why, and what it did
 * not check, then the data behind it. A token check used to open on
 * "The agent gave no summary", then its address, name and symbol, with
 * the verdict fourth and the reasons folded behind "Show 3 items".
 * Colour is never the only signal: each reason carries an icon and, for
 * screen readers, the word.
 */
export function DeliveredAnswerView({ answer, chainId, when }: { answer: DeliveredAnswer; chainId: number; when: (value: string) => string }) {
  const led = Boolean(answer.verdict || answer.result || answer.reasons.length);
  return (
    <>
      <div className="flex flex-col gap-3">
        <span className="t-label">What came back</span>
        {answer.title && <p className="text-[15px] font-semibold">{answer.title}</p>}
        {answer.verdict && (
          <p className={cn('inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-[15px] font-semibold', answer.verdict.tone ? cn(TONE[answer.verdict.tone].wash, TONE[answer.verdict.tone].text) : 'bg-sunken text-ink')}>
            {answer.verdict.tone && <span aria-hidden>{TONE[answer.verdict.tone].mark}</span>}
            <span>
              <span className="sr-only">Verdict: </span>
              {answer.verdict.text}
            </span>
          </p>
        )}
        {answer.result ? (
          <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-ink">{answer.result}</p>
        ) : answer.raw ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[10px] bg-sunken p-4 text-[13px]">{answer.raw.slice(0, 8000)}</pre>
        ) : (
          !led && <p className="text-[13.5px] text-ink-3">The agent gave no summary; what it returned is below.</p>
        )}
        {answer.reasons.length > 0 && (
          <ul aria-label="Why" className="flex flex-col gap-2 text-[14px] leading-relaxed text-ink">
            {answer.reasons.slice(0, 10).map((r, i) => (
              <li key={`${i}:${r.text}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2">
                <span aria-hidden className={cn('mt-[3px]', r.tone ? TONE[r.tone].text : 'text-ink-3')}>
                  {r.tone ? TONE[r.tone].mark : <span className="ml-1 mt-[5px] block size-1.5 rounded-full bg-current" />}
                </span>
                <span className="break-words">
                  {r.tone && <span className="sr-only">{TONE[r.tone].said}: </span>}
                  {r.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        {answer.limitations.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-[12px] border border-rule bg-paper px-4 py-3">
            <span className="t-label">What it does not cover</span>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
              {answer.limitations.slice(0, 8).map((l) => <li key={l} className="break-words">{l}</li>)}
            </ul>
          </div>
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
        <div className="flex flex-col gap-1.5">
          <span className="t-label">{led ? 'The data behind it' : 'What it returned'}</span>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-[12px] border border-rule bg-paper p-4 text-[13.5px] sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
            {answer.fields.slice(0, 14).map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-[12.5px] capitalize text-ink-3">{f.label}</dt>
                <dd className="min-w-0 text-ink-2"><AnswerValue value={f.value} /></dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {answer.sources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="t-label">Where it came from</span>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
            {answer.sources.slice(0, 8).map((s) => <li key={s} className="break-words">{s}</li>)}
          </ul>
        </div>
      )}
      <p className="text-[12px] text-ink-3">Written by the agent. Pokter shows it as delivered and has not checked that it is right.</p>
    </>
  );
}
