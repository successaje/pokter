import type { ProviderChoice } from '@/lib/hire/useHire';

/** Whether the provider a network starts on is the agent's own wallet, rather than Pokter's delivery agent. */
export function deliversItself(providers: ProviderChoice[]): boolean {
  const first = providers.find((p) => p.reachable && p.automatedDelivery) ?? providers.find((p) => p.reachable) ?? providers[0];
  return first?.relationship === 'registry-agent';
}
