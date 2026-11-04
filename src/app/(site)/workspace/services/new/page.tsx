import { redirect } from 'next/navigation';

/** Keep bookmarked editor URLs working after service publishing moved into Building. */
export default async function LegacyServiceEditor({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) value.forEach((part) => query.append(key, part));
    else if (value !== undefined) query.set(key, value);
  }
  redirect(`/build/services/new${query.size ? `?${query}` : ''}`);
}
