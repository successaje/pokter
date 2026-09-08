/**
 * Prove the session allowlist is enforced on-chain, not by Pokter.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/prove-enforcement.mts
 *
 * The product claims a granted agent cannot call outside its allowlist. That
 * claim is worth exactly nothing unless somebody tries it, so this grants a
 * session scoped to one contract and then makes two calls through it — one
 * inside the scope and one outside — and reports what the chain did with each.
 *
 * No funds move. Both calls carry zero value; the only thing being tested is
 * whether the Altana account contract's validator accepts them.
 */
import { createClient, BNB_TESTNET, signerFromPrivateKey } from '@altananetwork/sdk';
import { getAddress, type Address } from 'viem';

/*
 * Config is inlined rather than imported from src/lib. Those modules are
 * marked `server-only`, which needs --conditions=react-server, which makes tsx
 * resolve this package as CJS — and the package declares `main` while its
 * exports map has no `require` condition, so that throws. That is issue #88,
 * which we filed this morning and have now hit ourselves.
 */
const ALTANA_NETWORK = BNB_TESTNET;

/** In scope: the PancakeSwap V3 router the rebalancing preset allows. */
const ALLOWED: Address = getAddress('0x9a489505a00cE272eAa5e07Dba6491314CaE3796');

/** Out of scope: an address the session was never granted. */
const NOT_ALLOWED: Address = getAddress(
  '0x000000000000000000000000000000000000dEaD',
);

/** `refundETH()` — zero value, no side effect worth having. */
const HARMLESS = '0x12210e8a' as const;

const client = createClient({ chains: [ALTANA_NETWORK] });
const signer = signerFromPrivateKey(process.env.ALTANA_ADMIN_KEY as `0x${string}`);

const wallet = await client.createWallet({ signer });
console.log('wallet :', wallet.address);

const session = await client.grantSession({
  wallet,
  signer,
  permissions: {
    calls: [{ to: ALLOWED }],
    spend: [{ limit: 10n ** 15n, period: 'day' }],
  },
  expiry: Math.floor(Date.now() / 1000) + 3600,
  register: true,
});

console.log('session:', session.publicKey.slice(0, 22) + '…');
console.log('scope  : calls only to', ALLOWED, '\n');

async function attempt(label: string, to: Address) {
  process.stdout.write(`${label.padEnd(34)}`);
  try {
    const result = await client.execute({
      session,
      calls: [{ to, data: HARMLESS, value: 0n }],
      chainId: 97,
    });
    console.log('ACCEPTED  tx', (result.transactionHash ?? '(none)').slice(0, 20) + '…');
    return { accepted: true, detail: result.transactionHash ?? null };
  } catch (error) {
    const message = (error as Error).message.replace(/\s+/g, ' ').slice(0, 130);
    console.log('REJECTED');
    console.log(' '.repeat(34) + message);
    return { accepted: false, detail: message };
  }
}

const inScope = await attempt('in scope   (router)', ALLOWED);
const outOfScope = await attempt('out of scope (unlisted addr)', NOT_ALLOWED);

console.log('\n---');
console.log('in scope accepted     :', inScope.accepted);
console.log('out of scope accepted :', outOfScope.accepted);
/*
 * Both calls failing is not evidence. An earlier run had both rejected by a
 * type error in the caller, which would have read as the allowlist working
 * while proving nothing at all. A pass requires the in-scope call to be
 * accepted and the out-of-scope one refused — anything else is inconclusive
 * and says so.
 */
if (inScope.accepted && !outOfScope.accepted) {
  console.log(
    'PROVEN — same session, same calldata, only the target differed.\n' +
      'The in-scope call was accepted and the unlisted one was refused by the\n' +
      'account contract, not by Pokter.',
  );
} else if (inScope.accepted && outOfScope.accepted) {
  console.log('FAIL — an unlisted target was accepted. The allowlist is not holding.');
} else {
  console.log(
    'INCONCLUSIVE — the in-scope call did not go through, so this run tested\n' +
      'nothing about the allowlist. Fix that before reading anything into the\n' +
      'out-of-scope result.',
  );
}
