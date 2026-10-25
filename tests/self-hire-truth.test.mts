import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * One account of self-hire, in every place that gives one.
 *
 * Four surfaces described it and they contradicted each other and the
 * records. The integration kit said "the escrow will not let it hire
 * itself"; #307 found that false and replaced it with "Nothing stops an
 * agent being hired by its own wallet" — which is false the other way,
 * because Pokter's own hire page disables the button. Meanwhile the hire
 * screen still carried the original claim, three lines below a comment
 * stating the real reasons, and `wallet-roles` said the escrow "refuses
 * to settle at all" and that two mainnet jobs "can never be completed by
 * anyone".
 *
 * The records settle it. Of seven self-hires ever funded, testnet job
 * 1444 reached COMPLETED and six expired undelivered, both mainnet ones
 * among them. So the escrow accepts such a job; an agent simply does not
 * tend to answer its own hire. That is a different failure from the
 * contract rejecting one, and telling a builder the escrow refuses sends
 * them hunting a revert that never happens.
 *
 * Each wrong version is pinned here rather than only the right one,
 * because this claim has now been rewritten twice and drifted both ways.
 */
/*
 * Comments are stripped before matching, the pattern
 * `tests/provider-route-wiring.test.mts` uses. Several of these files
 * deliberately quote the sentences below while recording why they were
 * wrong — that is documentation, and a test that could not tell it from
 * a published claim would force the history to be deleted to pass.
 */
const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SURFACES = [
  'src/lib/integration/kit.ts',
  'src/lib/builder/ai-prompt.ts',
  'src/features/hire/HireFlow.tsx',
  'src/lib/builder/wallet-roles.ts',
] as const;

/** The claim the records refute: that the contract rejects a self-hire. */
const ESCROW_REFUSES = [
  /escrow will not accept a delivery where the seller and the buyer are the same/i,
  /escrow will not let it hire itself/i,
  /escrow refuses to\s*\n?\s*\*?\s*settle at all/i,
  /escrow will not settle a job where the payer and the payee match/i,
  /seller cannot deliver to itself/i,
  /can never be completed by anyone/i,
];

/** The claim Pokter's own hire page refutes: that nothing stops it. */
const NOTHING_STOPS = [/nothing stops (an|the) agent being hired by its own wallet/i];

test('no surface claims the escrow refuses a self-hire', () => {
  for (const path of SURFACES) {
    const text = read(path);
    for (const pattern of ESCROW_REFUSES) {
      assert.doesNotMatch(
        text,
        pattern,
        `${path} says the escrow refuses a self-hire; testnet job 1444 is a self-hire that reached COMPLETED`,
      );
    }
  }
});

test('no surface claims nothing stops a self-hire', () => {
  for (const path of SURFACES) {
    assert.doesNotMatch(
      read(path),
      NOTHING_STOPS[0],
      `${path} says nothing stops a self-hire; useHire's selfHire disables the Hire button`,
    );
  }
});

/*
 * The block is real and is Pokter's, so the code that performs it has to
 * stay — otherwise the copy above becomes the false one, in the other
 * direction, for the third time.
 */
test('the hire page still refuses a self-hire, so the copy stays true', () => {
  const hook = read('src/lib/hire/useHire.ts');
  assert.match(hook, /const selfHire = Boolean\(/, 'useHire no longer computes selfHire');
  assert.match(hook, /&& !selfHire/, 'selfHire no longer blocks the brief from being described');

  const flow = read('src/features/hire/HireFlow.tsx');
  assert.match(flow, /hire\.selfHire \|\|/, 'the Hire button is no longer disabled on a self-hire');
});

/* Each surface that mentions it names the real consequence, so a builder
   knows what to expect instead of only what not to do. */
test('each surface names where a self-hire actually fails', () => {
  for (const path of ['src/lib/integration/kit.ts', 'src/lib/builder/ai-prompt.ts']) {
    const text = read(path);
    assert.match(text, /hire page refuses it/i, `${path} does not say where the refusal comes from`);
    assert.match(text, /delivery figures/i, `${path} does not say what a self-hire costs`);
  }
});
