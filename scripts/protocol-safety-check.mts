import { toSessionPermissions } from '../src/lib/altana/permissions';

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
