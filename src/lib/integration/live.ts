import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { enabledEscrowChains } from '@/lib/network/escrow';
import { chainLabel } from '@/lib/network/presentation';

import { kitTokens } from './currencies';
import { buildIntegrationKit, type IntegrationKit } from './kit';

/** The integration kit for the escrows this deployment funds on. */
export function integrationKit(origin = 'https://pokter.xyz'): IntegrationKit {
  return buildIntegrationKit(
    origin,
    enabledEscrowChains().map((chainId) => {
      const a = correctedErc8183Addresses(chainId);
      /* Every token Pokter funds on this escrow, with its registry decimals; `paymentToken` stays the default. */
      return { chainId, network: chainLabel(chainId), commerce: a.commerce, router: a.router, policy: a.policy, paymentToken: a.paymentToken, tokens: kitTokens(chainId) };
    }),
  );
}
