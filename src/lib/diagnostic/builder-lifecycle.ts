import type { DiagnosticCheck } from './checks';

export interface BuilderLifecycle {
  registered: boolean;
  profileReady: boolean;
  categoryReady: boolean;
  endpointReady: boolean;
  quoteReady: boolean;
  enrolled: boolean;
  measured: boolean;
  listed: boolean;
  hireable: boolean;
  probeCount: number;
}

export interface BuilderReadinessStep {
  id: 'registered' | 'profile' | 'reachable' | 'priced' | 'measured';
  label: string;
  done: boolean;
  detail: string;
  action: string;
}

function passed(checks: DiagnosticCheck[], id: string) {
  return checks.some((check) => check.id === id && check.status === 'pass');
}

/** Derive builder-facing states only from observations Pokter can substantiate. */
export function deriveBuilderLifecycle({
  chainId,
  checks,
  enrolled,
  probeCount,
}: {
  chainId: number;
  checks: DiagnosticCheck[];
  enrolled: boolean;
  probeCount: number;
}): BuilderLifecycle {
  const registered = passed(checks, 'identity');
  const profileReady = passed(checks, 'card');
  const categoryReady = passed(checks, 'category');
  const endpointReady = passed(checks, 'endpoint') && passed(checks, 'liveness');
  const quoteReady = passed(checks, 'quote');
  const independentlyAttested = passed(checks, 'attestations');
  const measured = probeCount > 0 || independentlyAttested;
  /*
   * Either chain the campaign recognises.
   *
   * This was mainnet only, so a builder who registered on testnet — the
   * only chain where their agent can perform its own onchain actions, and
   * therefore the only one where it can satisfy the campaign's execution
   * bar — was told by their own dashboard that they were not listed.
   * Pokter lists both now; see LISTED_CHAINS.
   */
  const listed = (chainId === 56 || chainId === 97) && registered;
  const hireable = ['identity', 'endpoint', 'liveness', 'quote'].every((id) => passed(checks, id));
  return { registered, profileReady, categoryReady, endpointReady, quoteReady, enrolled, measured, listed, hireable, probeCount };
}

/** Builder-facing sequence. Campaign qualification is deliberately not inferred here. */
export function builderReadinessSteps(lifecycle?: BuilderLifecycle): BuilderReadinessStep[] {
  return [
    {
      id: 'registered',
      label: 'Identity',
      done: Boolean(lifecycle?.registered),
      detail: lifecycle?.registered ? 'ERC-8004 owner and signing wallet verified' : 'No verifiable ERC-8004 identity yet',
      action: 'Register the identity or enter an existing agent ID.',
    },
    {
      id: 'profile',
      label: 'Profile',
      done: Boolean(lifecycle?.profileReady && lifecycle?.categoryReady),
      detail: lifecycle?.profileReady && lifecycle?.categoryReady
        ? 'Capabilities and marketplace outcome are readable'
        : 'Publish readable capabilities and a clear financial outcome',
      action: 'Update the public agent card with capabilities and category-consistent language.',
    },
    {
      id: 'reachable',
      label: 'Reachable',
      done: Boolean(lifecycle?.enrolled && lifecycle?.endpointReady),
      detail: lifecycle?.endpointReady ? 'Endpoint passed live protocol checks' : 'A live A2A or MCP endpoint is required',
      action: 'Run the compatibility check and fix the first failed endpoint or liveness check.',
    },
    {
      id: 'priced',
      label: 'Hireable',
      done: Boolean(lifecycle?.quoteReady),
      detail: lifecycle?.quoteReady ? 'Buyers can receive a wallet-verified price' : 'No valid signed price is available yet',
      action: 'Publish a signed quote from the registered agent wallet.',
    },
    {
      id: 'measured',
      label: 'Measured',
      done: Boolean(lifecycle?.measured),
      detail: lifecycle?.probeCount
        ? `${lifecycle.probeCount} independent probe${lifecycle.probeCount === 1 ? '' : 's'} in 90 days`
        : 'No independent probe or attestation yet',
      action: 'Keep the endpoint online while Pokter builds independent history.',
    },
  ];
}

export function nextBuilderAction(lifecycle?: BuilderLifecycle) {
  return builderReadinessSteps(lifecycle).find((step) => !step.done) ?? null;
}
