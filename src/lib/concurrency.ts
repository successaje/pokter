/**
 * Run tasks with a ceiling on how many are in flight at once.
 *
 * Discovery fans out to roughly sixteen registry queries per page load, which
 * trips 8004scan's 30 req/min anonymous limit and stalls the render. Capping
 * in-flight requests keeps us inside the budget; a Pro key raises the limit but
 * should not be a prerequisite for the page working.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
