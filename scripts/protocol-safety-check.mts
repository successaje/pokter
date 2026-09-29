import { toSessionPermissions } from '../src/lib/altana/permissions';
import {
  decodePokterJobEnvelope,
  encodePokterJobEnvelope,
} from '../src/lib/erc8183/job-envelope';
import { verifyNegotiationSignature } from '../src/lib/erc8183/negotiation';
import { privateKeyToAccount } from 'viem/accounts';
import { walletActionError } from '../src/lib/wallet/errors';

const marketplaceCategories = [
  'rebalancing',
  'grid-trading',
  'yield',
  'health-factor',
];

for (const category of marketplaceCategories) {
  let refused = false;
  try {
    toSessionPermissions({
      category,
      spendCapBnb: 0.02,
      period: 'week',
      expiryDays: 7,
    });
  } catch (error) {
    refused = (error as Error).message.includes(
      'recipient, asset, position and amount constraints are not yet enforced',
    );
  }
  if (!refused) {
    throw new Error(`${category} produced a delegated wallet session`);
  }
}

console.log('Protocol safety checks passed.');

const description = encodePokterJobEnvelope({
  identityChainId: 56,
  agentTokenId: '45422',
  agentName: 'Yield agent',
  category: 'yield',
  provider: '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87',
  providerLabel: 'Delivery provider',
  task: 'Return a verifiable execution receipt.',
});
const decoded = decodePokterJobEnvelope(description);
if (
  decoded?.identity.chainId !== 56 ||
  decoded.identity.tokenId !== '45422' ||
  decoded.identity.name !== 'Yield agent' ||
  decoded.category !== 'yield' ||
  decoded.providerLabel !== 'Delivery provider' ||
  decoded.task !== 'Return a verifiable execution receipt.'
) {
  throw new Error('ERC-8004 identity did not survive the job envelope round trip');
}
if (decoded.provider.toLowerCase() !== '0x60ef148485c2a5119fa52ca13c52e9fd98f28e87') {
  throw new Error('Fulfilment provider did not survive the job envelope round trip');
}

console.log('Job identity envelope checks passed.');

const legacyEnvelope = decodePokterJobEnvelope(
  JSON.stringify({
    protocol: 'pokter-job',
    version: 1,
    identity: { chainId: 56, tokenId: '302257' },
    category: 'health-factor',
    provider: '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87',
    task: 'Legacy job without display labels.',
  }),
);
if (
  legacyEnvelope?.identity.tokenId !== '302257' ||
  legacyEnvelope.identity.name !== undefined ||
  legacyEnvelope.providerLabel !== undefined
) {
  throw new Error('Legacy job envelopes no longer decode safely');
}

console.log('Legacy job envelope checks passed.');

const quoteSigner = privateKeyToAccount(
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
);
const quoteHash =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const quoteSignature = await quoteSigner.signMessage({
  message: { raw: quoteHash },
});
const recoveredQuoteSigner = await verifyNegotiationSignature({
  negotiationHash: quoteHash,
  providerSignature: quoteSignature,
  expectedProvider: quoteSigner.address,
});
if (recoveredQuoteSigner !== quoteSigner.address) {
  throw new Error('A valid negotiation signature did not recover its provider');
}
let wrongProviderAccepted = false;
try {
  await verifyNegotiationSignature({
    negotiationHash: quoteHash,
    providerSignature: quoteSignature,
    expectedProvider: '0x000000000000000000000000000000000000dEaD',
  });
  wrongProviderAccepted = true;
} catch {
  // Expected: a quote from one provider cannot authenticate another listing.
}
if (wrongProviderAccepted) {
  throw new Error('A negotiation signature authenticated the wrong provider');
}

console.log('Negotiation signature checks passed.');

if (
  walletActionError(
    new Error('Authorization did not complete. Reason: 0x Details: 0x'),
    'Commissioning',
  ) !==
  'Commissioning did not complete. The wallet returned no usable reason. Check the selected network and wallet balance, then try again.'
) {
  throw new Error('Opaque wallet failures were not translated into recovery guidance');
}
if (
  walletActionError(new Error('User rejected the request'), 'Commissioning') !==
  'Commissioning was cancelled. No transaction was submitted.'
) {
  throw new Error('Cancelled wallet actions were not distinguished from failures');
}

console.log('Wallet error translation checks passed.');
