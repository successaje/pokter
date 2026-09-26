const WIDTHS = ['w-2/3', 'w-full', 'w-5/6'];

export default function Loading() {
  return (
    <div className="flex flex-col gap-8 pt-6" aria-label="Loading page">
      <div className="flex max-w-2xl flex-col gap-3">
        <div className="h-3 w-24 animate-pulse rounded bg-[color:var(--surface-raised)]" />
        <div className="h-8 w-72 max-w-full animate-pulse rounded bg-[color:var(--surface-raised)]" />
        <div className="flex flex-col gap-2">
          {WIDTHS.map((width) => (
            <div
              key={width}
              className={`${width} h-3 animate-pulse rounded bg-[color:var(--surface-raised)]`}
            />
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
          />
        ))}
      </div>
      <span className="sr-only">Loading current protocol data…</span>
    </div>
  );
}
