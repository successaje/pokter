/**
 * Verify every session transaction Pokter has recorded, independently of the
 * SDK's own report: confirm each landed, succeeded, touched Altana's KeyStore,
 * and — for a scoped grant — that the allowlisted contract address really
 * appears in the on-chain calldata.
 *
 *   npx tsx scripts/verify-tx.mts
 */
import { DatabaseSync } from 'node:sqlite';
import { createPublicClient, http, formatEther, type Hex } from 'viem';
import { bscTestnet } from 'viem/chains';
import { BNB_TESTNET } from '@altananetwork/sdk';

import { PANCAKESWAP_V3_POSITION_MANAGER } from '../src/lib/altana/contracts.js';

const db = new DatabaseSync(process.env.SESSION_DB_PATH ?? './data/sessions.db');
const rows = db
  .prepare(
    `SELECT agent_name, wallet_address, spend_cap_wei, period,
            grant_tx_hash, revoke_tx_hash
       FROM sessions ORDER BY granted_at ASC`,
  )
  .all() as unknown as {
  agent_name: string;
  wallet_address: string;
  spend_cap_wei: string;
  period: string;
  grant_tx_hash: string | null;
  revoke_tx_hash: string | null;
}[];

const client = createPublicClient({
  chain: bscTestnet,
  transport: http('https://bsc-testnet-rpc.publicnode.com'),
});

const POSITION_MANAGER = PANCAKESWAP_V3_POSITION_MANAGER.address
  .toLowerCase()
  .slice(2);

console.log(`KeyStore : ${BNB_TESTNET.keyStore}`);
console.log(`sessions : ${rows.length}\n`);

let verified = 0;
let failed = 0;

for (const row of rows) {
  console.log(`${row.agent_name}`);
  console.log(
    `  cap ${formatEther(BigInt(row.spend_cap_wei))} BNB / ${row.period}`,
  );

  for (const [kind, hash] of [
    ['grant', row.grant_tx_hash],
    ['revoke', row.revoke_tx_hash],
  ] as const) {
    if (!hash) continue;

    try {
      const [receipt, tx] = await Promise.all([
        client.getTransactionReceipt({ hash: hash as Hex }),
        client.getTransaction({ hash: hash as Hex }),
      ]);

      const touchedKeyStore = [receipt.to, ...receipt.logs.map((l) => l.address)]
        .filter(Boolean)
        .some((a) => a?.toLowerCase() === BNB_TESTNET.keyStore.toLowerCase());

      const scoped = tx.input.toLowerCase().includes(POSITION_MANAGER);

      if (receipt.status === 'success') verified += 1;
      else failed += 1;

      console.log(
        `  ${kind.padEnd(6)} ${receipt.status}  block ${receipt.blockNumber}  gas ${receipt.gasUsed}` +
          `  keystore=${touchedKeyStore}  allowlisted-target=${scoped}`,
      );
      console.log(`         ${BNB_TESTNET.explorer.replace(/\/$/, '')}/tx/${hash}`);
    } catch (error) {
      failed += 1;
      console.log(`  ${kind.padEnd(6)} NOT FOUND — ${(error as Error).message.slice(0, 70)}`);
    }
  }
  console.log();
}

const balance = await client.getBalance({
  address: (rows[0]?.wallet_address ?? '0x') as Hex,
});
console.log(`${verified} transaction(s) verified, ${failed} failed`);
console.log(`wallet balance: ${formatEther(balance)} tBNB`);
