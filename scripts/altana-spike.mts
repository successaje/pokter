/**
 * Altana integration spike.
 *
 * Walks the §32 checklist against BSC testnet and reports exactly where each
 * step succeeds or fails. Output is the raw material for
 * docs/integrations/altana.md — including the failures, which are the part
 * worth documenting.
 *
 *   npx tsx scripts/altana-spike.ts
 */
import {
  createClient,
  signerFromPrivateKey,
  BNB_TESTNET,
} from '@altananetwork/sdk';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatEther, parseEther } from 'viem';

type StepResult = { step: string; ok: boolean; detail: string };
const results: StepResult[] = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${step}\n        ${detail}`);
}

async function main() {
  console.log('Altana spike — BSC testnet (chain 97)\n');

  // An admin key the spike controls. In the app this is the user's wallet;
  // here it is ephemeral so the run is reproducible and owns nothing.
  const adminKey = (process.env.ALTANA_ADMIN_KEY as `0x${string}`) ?? generatePrivateKey();
  const adminAccount = privateKeyToAccount(adminKey);
  console.log(`admin EOA : ${adminAccount.address}`);
  console.log(`relay     : ${BNB_TESTNET.relayUrl}`);
  console.log(`keystore  : ${BNB_TESTNET.keyStore}\n`);

  const rpc = createPublicClient({
    chain: BNB_TESTNET.chain,
    transport: http(BNB_TESTNET.publicRpcUrl),
  });

  // 1. Client
  let client;
  try {
    client = createClient({ chains: [BNB_TESTNET] });
    record('createClient', true, `default chain ${client.defaultChainId}`);
  } catch (error) {
    record('createClient', false, (error as Error).message);
    return summarise();
  }

  // 2. Wallet — counterfactual, should need no gas.
  let wallet;
  try {
    const signer = signerFromPrivateKey(adminKey);
    wallet = await client.createWallet({ signer });
    record('createWallet', true, `smart account ${wallet.address}`);
  } catch (error) {
    record('createWallet', false, (error as Error).message);
    return summarise();
  }

  // 3. Funding check — the first on-chain action needs gas.
  let funded = false;
  try {
    const balance = await rpc.getBalance({ address: wallet.address });
    funded = balance > parseEther('0.001');
    record(
      'wallet funded',
      funded,
      funded
        ? `${formatEther(balance)} tBNB available`
        : `${formatEther(balance)} tBNB — needs funding at https://testnet.bnbchain.org/faucet-smart for ${wallet.address}`,
    );
  } catch (error) {
    record('wallet funded', false, (error as Error).message);
  }

  // 4. Grant a scoped session. This is the §31 permission model.
  const expiry = Math.floor(Date.now() / 1000) + 7 * 86_400;
  const permissions = {
    // PancakeSwap V3 SwapRouter on BSC testnet.
    calls: [
      {
        to: '0x9a489505a00cE272eAa5e07Dba6491314CaE3796' as `0x${string}`,
        signature: 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))',
      },
    ],
    spend: [{ limit: parseEther('0.05'), period: 'week' as const }],
  };

  try {
    const session = await client.grantSession({
      wallet,
      signer: signerFromPrivateKey(adminKey),
      permissions,
      expiry,
      register: true,
    });
    record(
      'grantSession',
      true,
      `key ${session.publicKey.slice(0, 18)}… expiry ${new Date(expiry * 1000).toISOString()}` +
        (session.transactionHash ? ` tx ${session.transactionHash}` : ' (no tx reported)'),
    );

    // 5. Revoke, proving the permission is reversible.
    try {
      const revoked = await client.revokeSession({
        wallet,
        signer: signerFromPrivateKey(adminKey),
        session,
      });
      record('revokeSession', true, `status ${revoked.status} tx ${revoked.transactionHash ?? '—'}`);
    } catch (error) {
      record('revokeSession', false, (error as Error).message);
    }
  } catch (error) {
    record(
      'grantSession',
      false,
      `${(error as Error).message}${funded ? '' : ' (wallet is unfunded — likely the cause)'}`,
    );
  }

  summarise();
}

function summarise() {
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} steps succeeded`);
  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.log('\nblocking:');
    for (const f of failures) console.log(`  - ${f.step}: ${f.detail}`);
  }
}

main().catch((error) => {
  console.error('\nspike crashed:', error);
  process.exit(1);
});
