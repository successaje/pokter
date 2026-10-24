/** Which URLs a read tries, in order. Pure, so the rule is tested without a key; see `rpc.ts`. */
export type ReadKind = 'present' | 'history';

export function rpcOrder(kind: ReadKind, publicUrls: readonly string[], archiveUrl: string | null): Array<{ url: string; public: boolean }> {
  const publics = publicUrls.map((url) => ({ url, public: true }));
  const archive = archiveUrl ? [{ url: archiveUrl, public: false }] : [];
  return kind === 'history' ? [...archive, ...publics] : [...publics, ...archive];
}
