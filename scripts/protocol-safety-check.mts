import { toSessionPermissions } from '../src/lib/altana/permissions';
import {
  decodePokterJobEnvelope,
  encodePokterJobEnvelope,
} from '../src/lib/erc8183/job-envelope';

const delegatedWriteCategories = ['rebalancing', 'grid-trading', 'yield'];

for (const category of delegatedWriteCategories) {
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
      'recipient and asset constraints are not yet enforced',
    );
  }
  if (!refused) {
    throw new Error(`${category} produced an unsafe delegated-write session`);
  }
}

const monitor = toSessionPermissions({
  category: 'health-factor',
  spendCapBnb: 0.02,
  period: 'week',
  expiryDays: 7,
});
if ((monitor.calls?.length ?? 0) !== 0) {
  throw new Error('The read-only health-factor category gained write calls');
}

console.log('Protocol safety checks passed.');

const description = encodePokterJobEnvelope({
  identityChainId: 56,
  agentTokenId: '45422',
  category: 'yield',
  provider: '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87',
  task: 'Return a verifiable execution receipt.',
});
const decoded = decodePokterJobEnvelope(description);
if (
  decoded?.identity.chainId !== 56 ||
  decoded.identity.tokenId !== '45422' ||
  decoded.category !== 'yield' ||
  decoded.task !== 'Return a verifiable execution receipt.'
) {
  throw new Error('ERC-8004 identity did not survive the job envelope round trip');
}
if (decoded.provider.toLowerCase() !== '0x60ef148485c2a5119fa52ca13c52e9fd98f28e87') {
  throw new Error('Fulfilment provider did not survive the job envelope round trip');
}

console.log('Job identity envelope checks passed.');
