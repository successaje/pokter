import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { parseMarketplaceOrder, type MarketplaceOrder } from '@/lib/search/order';

export interface DiscoverParams {
  q: string;
  category: Category | null;
  hireable: boolean;
  answering: boolean;
  priced: boolean;
  evidence: 'any' | 'measured' | 'corroborated';
  chain: 'any' | '56' | '97';
  sort: MarketplaceOrder;
  view: 'grid' | 'list';
}

export function parseDiscoverParams(sp: Record<string, string | string[] | undefined>): DiscoverParams {
  const one = (key: string) => {
    const v = sp[key];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const cat = one('category');
  const evidence = one('evidence');
  const chain = one('chain');
  return {
    // `brief` is the previous product's natural-language parameter.
    q: (one('q') || one('brief')).slice(0, 400),
    category: CATEGORY_BY_ID.has(cat as Category) ? (cat as Category) : null,
    hireable: one('hireable') === '1',
    answering: one('answering') === '1',
    priced: one('priced') === '1',
    evidence: evidence === 'measured' || evidence === 'corroborated' ? evidence : 'any',
    chain: chain === '56' || chain === '97' ? chain : 'any',
    sort: parseMarketplaceOrder(one('sort')),
    view: one('view') === 'list' ? 'list' : 'grid',
  };
}

export function discoverHref(params: Partial<DiscoverParams>, base: DiscoverParams, reset: Array<keyof DiscoverParams> = []) {
  const next = { ...base, ...params };
  for (const key of reset) {
    if (key === 'q') next.q = '';
    if (key === 'category') next.category = null;
  }
  const sp = new URLSearchParams();
  if (next.q) sp.set('q', next.q);
  if (next.category) sp.set('category', next.category);
  if (next.hireable) sp.set('hireable', '1');
  if (next.answering) sp.set('answering', '1');
  if (next.priced) sp.set('priced', '1');
  if (next.evidence !== 'any') sp.set('evidence', next.evidence);
  if (next.chain !== 'any') sp.set('chain', next.chain);
  if (next.sort !== 'recommended') sp.set('sort', next.sort);
  if (next.view !== 'grid') sp.set('view', next.view);
  const s = sp.toString();
  return s ? `/discover?${s}` : '/discover';
}
