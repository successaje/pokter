import { cn } from '@/lib/ui/cn';

/**
 * "There is nothing to show here", rendered one way.
 *
 * Twelve places had grown their own copy of the same dashed box with slightly
 * different padding, alignment and text size. This is that box, once.
 *
 * What it deliberately does *not* do is supply the words. The product's whole
 * argument rests on keeping these claims apart — "we asked and the answer was
 * empty" is not "we have not observed enough yet", which is not "the agent did
 * not answer us", which is not "we failed to ask" — and a component with a
 * `kind` prop and four canned sentences would flatten them into a menu. Each
 * caller says the true thing about its own case; this only makes them look
 * like siblings.
 *
 * Two shapes. With a title it is a page-level state and centres; without one
 * it is a note inside an already-titled section and stays in the text flow.
 */
export function StatusState({
  title,
  body,
  className,
}: {
  /** Omit inside a section that already has a heading. */
  title?: string;
  body: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-6',
        title && 'text-center',
        className,
      )}
    >
      {title && <p className="text-sm font-medium">{title}</p>}
      <p
        className={cn(
          'text-xs leading-relaxed text-[color:var(--text-faint)]',
          title && 'mx-auto mt-1.5 max-w-md',
        )}
      >
        {body}
      </p>
    </div>
  );
}
