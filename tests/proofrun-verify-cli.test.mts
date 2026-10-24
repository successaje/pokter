import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { main, replayArtifact } from '../scripts/proofrun-verify.mjs';
import { CHECKED_POOL, type VenusEvidence } from '../src/lib/delivery/venus-report-check';
import { sealArtifact, type ProofRunArtifact, type SealedArtifact } from '../src/lib/proofrun/artifact';
import {
  buildRun,
  factsOf,
  loadFixture,
  manifestOf,
  startStubNode,
  stubOptionsFor,
  type ProofRunFixture,
  type StubNodeOptions,
} from './fixtures/proofrun/support.mjs';

/**
 * `scripts/proofrun-verify.mts` as a buyer would run it: a separate process,
 * given a file and an endpoint, judged on its exit code and its output.
 *
 * The endpoint is a stub BNB Chain node (`fixtures/proofrun/support.mts`) that
 * answers exactly the calls `readVenusPosition` makes. That is what makes this
 * an integration test of the whole route rather than of the helpers: the
 * verifier does not know it is being tested, has no injected reader, and has
 * to ask a node over HTTP for state at a block and be told no.
 *
 * Every refusal below is paired with the control that must still pass on the
 * same artifact, because this repository has shipped two tests that passed
 * whichever way the code went. If the verifier stopped refusing, the refusal
 * assertion fails; if it started refusing everything, the control fails.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const SCRIPT = join(ROOT, 'scripts', 'proofrun-verify.mts');
const dir = mkdtempSync(join(tmpdir(), 'proofrun-cli-'));

const fixture = (file: string): ProofRunFixture => loadFixture(file);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function writeJson(name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

interface Run {
  code: number;
  /** As printed, for the headline and the columns. */
  out: string;
  /** The same with runs of whitespace collapsed, for prose that the output wraps. */
  flat: string;
}

/**
 * Spawned asynchronously, which is load-bearing rather than stylistic.
 *
 * `spawnSync` blocks this process's event loop, and the stub node runs in this
 * process — so every request the verifier made sat unanswered until its own
 * timeout expired, and every refusal test "passed" against a node that had
 * simply never replied. The first run of this file took sixty-nine seconds
 * and reported exactly the refusal it was meant to prove, for the wrong
 * reason, which is why the timeout assertion below exists as well.
 */
async function run(args: string[], options: { withNodeRealKey?: boolean } = {}): Promise<Run> {
  const env = { ...process.env };
  // Removed unless a test asks for it, so a developer's own key cannot change
  // what any of these prove.
  if (!options.withNodeRealKey) delete env.NODEREAL_API_KEY;
  const { code, out } = await new Promise<{ code: number; out: string }>((resolve, reject) => {
    const child = spawn(TSX, [SCRIPT, ...args], { cwd: ROOT, env });
    let text = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      text += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      text += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ code: status ?? -1, out: text }));
  });
  assert.doesNotMatch(out, /\bat (?:Object|Module|async)\b[\s\S]*\.mts:/, `the verifier crashed instead of answering:\n${out}`);
  assert.doesNotMatch(out, /took too long to respond|timed out/i, `the stub node did not answer:\n${out}`);
  return { code, out, flat: out.replace(/\s+/g, ' ') };
}

/**
 * The same verifier, driven through its `main` rather than through a spawn.
 *
 * `main` is the whole of the command: it opens the file, checks the integrity,
 * reads the chain over HTTP from the endpoint it is given, compares the two
 * runs and renders the answer, returning the exit code it would have set. So
 * this is the full route and not a helper — what it does not cover is the
 * process boundary itself, which the spawned runs below do, on four cases
 * chosen to span the exit codes.
 *
 * It exists because a spawn costs several seconds of TypeScript startup and
 * there are forty-odd cases here; the first version of this file added five
 * minutes to `npm test`.
 */
async function replay(artifactPath: string, stub: StubNodeOptions, extra: string[] = [], rpcPath = ''): Promise<Run & { node: Awaited<ReturnType<typeof startStubNode>> }> {
  const node = await startStubNode(stub);
  try {
    const { code, lines } = await main([artifactPath, '--rpc', `${node.url}${rpcPath}`, ...extra]);
    const out = lines.join('\n');
    assert.doesNotMatch(out, /took too long to respond|timed out/i, `the stub node did not answer:\n${out}`);
    return { code, out, flat: out.replace(/\s+/g, ' '), node };
  } finally {
    await node.close();
  }
}

/** The same, as a spawned process, so the exit code is the real one. */
async function verify(artifactPath: string, stub: StubNodeOptions, extra: string[] = [], rpcPath = '') {
  const node = await startStubNode(stub);
  try {
    const result = await run([artifactPath, '--rpc', `${node.url}${rpcPath}`, ...extra]);
    return { ...result, node };
  } finally {
    await node.close();
  }
}

/* ---------- 1. the passing case ---------- */

test('1. a correct receipt, replayed against a node that serves the block, verifies and exits zero', async () => {
  const f = fixture('01-correct-report.json');
  const { sealed } = buildRun(f);
  const path = writeJson('correct.json', sealed);

  const { code, out, flat, node } = await replay(path, stubOptionsFor(f));
  assert.equal(code, 0, out);
  assert.match(out, /^Verified$/m);
  assert.match(flat, /Every one of the 7 checks in the receipt was re-run/);
  assert.match(flat, /All 7 checks matched Venus’s own accounting\./);
  assert.match(flat, /pinned to block 129170001 0x0fb0ff45/);
  assert.match(flat, /this replay comes to verified/);
  assert.match(flat, /passed hf\.value report 1\.1223 chain 1\.1223/);
  /*
   * The two inferred rows have to come out of the replay too, and they only
   * do because the rebuilt claim carries the chain in the field that reads as
   * an id. Rebuild it as a string and `readChain` calls it unreadable, the
   * replay reports binding.chain not-verified against a receipt that has it
   * passed, and the verifier manufactures a contradiction it then blames on
   * the receipt.
   */
  assert.match(flat, /passed binding\.account report the same account chain the account the brief named/);
  assert.match(flat, /passed binding\.chain report 56 chain 56/);
  // A column that exactly fills its width still needs a space after it.
  assert.doesNotMatch(flat, /accountchain|56chain/);

  // It read the block the receipt names, and no other. Not the head, not the
  // settled head, not 'latest'.
  assert.ok(node.callBlocks.length > 0, 'it did read the chain');
  assert.deepEqual([...new Set(node.callBlocks)], ['129170001']);
  assert.deepEqual([...new Set(node.headerBlocks)], ['129170001']);

  // And it says what it does and does not establish, on a pass as much as anywhere.
  assert.match(flat, /What this does and does not establish/);
  assert.match(flat, /hash shows these bytes are unaltered/);
  assert.match(flat, /says nothing about whether the figures are correct/);
  assert.match(flat, /A replay against a different node can legitimately disagree/);
  assert.match(flat, /Historical state is required/);
  assert.match(flat, /agent’s own build is not established unless it published one/);
  assert.match(flat, /figures were taken from the rows the receipt records/);
});

test('1b. agreement is reported as agreement about the rows, not as a clean report', async () => {
  /*
   * The receipt for a confidently wrong report. The replay agrees with it —
   * both find hf.value failed — and the exit code is still non-zero, because
   * four of the five criteria were never settled. What must never happen is
   * the output reading as though the report had passed.
   */
  const f = fixture('02-plausible-wrong-report.json');
  const { sealed } = buildRun(f);
  assert.equal(sealed.artifact.state, 'mismatch');
  const path = writeJson('wrong.json', sealed);

  const { code, out, flat } = await replay(path, stubOptionsFor(f));
  assert.equal(code, 2, out);
  assert.match(out, /^Not verified$/m);
  assert.match(flat, /failed hf\.value/);
  assert.match(flat, /this replay comes to mismatch/);
  assert.doesNotMatch(out, /^Verified$/m);
});

/* ---------- 2. unavailable evidence never passes ---------- */

test('2. no archive access: not verified, with the reason and no substituted block', async () => {
  const f = fixture('07-pruned-archive.json');
  /*
   * The receipt here is the correct one, carrying passing checks. That is the
   * whole point: the replay has every incentive to agree, and cannot, because
   * the node will not serve the block.
   */
  const correct = fixture('01-correct-report.json');
  const { sealed } = buildRun(correct);
  const path = writeJson('pruned.json', sealed);

  const { code, out, flat, node } = await replay(path, stubOptionsFor(f, { position: stubOptionsFor(correct).position }));
  assert.equal(code, 2, out);
  assert.match(out, /^Not verified$/m);
  assert.match(flat, /State at block 129170001 is not served by this node/);
  assert.match(flat, /missing trie node/, 'the node’s own words, not viem’s packaging');
  assert.match(flat, /No other block was read/);
  assert.match(flat, /Re-reading at the head would compare a report about one block with a position that has moved/);
  // Nothing was recomputed, so no checks are shown and nothing can read as a pass.
  assert.doesNotMatch(out, /Checks re-run/);
  assert.deepEqual([...new Set(node.callBlocks)], ['129170001'], 'it asked for the named block and gave up');
  assert.doesNotMatch(out, /latest/);
  // The output names the endpoint it actually called and no other.
  assert.doesNotMatch(out, /bsc-dataseed|bnbchain\.org|publicnode/);

  // The control, on the same artifact: served the block, it verifies. So the
  // refusal above is the missing state and nothing else.
  const served = await replay(path, stubOptionsFor(correct));
  assert.equal(served.code, 0, served.out);
});

test('2b. a reverting oracle is this replay’s failure to see, not a finding about the report', async () => {
  const f = fixture('05-stale-oracle.json');
  const correct = fixture('01-correct-report.json');
  const { sealed } = buildRun(correct);
  const path = writeJson('stale.json', sealed);

  const { code, out, flat } = await replay(path, stubOptionsFor(f, { position: stubOptionsFor(correct).position }));
  assert.equal(code, 2, out);
  assert.match(flat, /Venus could not be read at block 129170001/);
  assert.match(flat, /stale oracle price/);
  assert.match(flat, /failure to see, and says nothing about the report/);
  /*
   * And it is not reported as a pruned block. The two refusals mean different
   * things to a buyer — one says the node no longer keeps the block, the other
   * says the read failed and the report is not implicated — so a test that
   * only checked for "not verified" would pass with them swapped.
   */
  assert.doesNotMatch(flat, /not served by this node/);
  assert.doesNotMatch(out, /Checks re-run/);
});

test('2c. no endpoint and no archive key: not verified, with a message rather than a crash', async () => {
  const f = fixture('01-correct-report.json');
  const { sealed } = buildRun(f);
  const path = writeJson('no-archive.json', sealed);

  const { code, out, flat } = await run([path]);
  assert.equal(code, 2, out);
  assert.match(out, /^Not verified$/m);
  assert.match(flat, /NODEREAL_API_KEY is not set/);
  assert.match(flat, /pass --rpc with one, or set NODEREAL_API_KEY/);
  assert.match(flat, /nothing about the receipt has been established either way/);
  assert.match(flat, /endpoint none/);
  assert.doesNotMatch(out, /Checks re-run/);
});

/* ---------- 3. the state is pinned, or there is no verdict ---------- */

test('3. a different block at the same number: not verified, both hashes named, nothing recomputed', async () => {
  const f = fixture('08-mismatched-block-hash.json');
  const { sealed } = buildRun(f);
  const path = writeJson('reorged.json', sealed);

  const { code, out, flat } = await replay(path, stubOptionsFor(f));
  assert.equal(code, 2, out);
  assert.match(out, /^Not verified$/m);
  assert.match(flat, /Block 129170001 on this node is 0xf1b7f1b7/);
  assert.match(flat, /the receipt names 0x0fb0ff45/);
  assert.match(flat, /from a reorg or from a node on another chain/);
  assert.equal(f.expect.recomputeRuns, false);
  assert.doesNotMatch(out, /Checks re-run/, 'figures from the wrong state are not compared at all');

  /*
   * The control, and the one that matters most here: the figures this node
   * serves agree with the report exactly. Serve the same figures under the
   * receipt's own hash and it verifies. So the refusal is caused by the hash,
   * and by nothing about the figures.
   */
  const pinned = await replay(path, stubOptionsFor(f, { headers: stubOptionsFor(fixture('01-correct-report.json')).headers }));
  assert.equal(pinned.code, 0, pinned.out);
});

test('3b. a receipt with no block hash cannot be pinned, and is not verified on the number alone', async () => {
  const f = clone(fixture('01-correct-report.json'));
  f.subject!.blockHash = null;
  const { sealed } = buildRun(f);
  const path = writeJson('unpinned.json', sealed);

  const { code, out, flat, node } = await replay(path, stubOptionsFor(fixture('01-correct-report.json')));
  assert.equal(code, 2, out);
  assert.match(flat, /carries no block hash for it/);
  assert.match(flat, /A block number does not pin state/);
  assert.match(flat, /both have a block 129170001/);
  assert.equal(node.methods.length, 0, 'an unpinnable receipt costs the node nothing');
});

test('3b2. a reader that answers for a different block is refused, whatever it says it read', async () => {
  /*
   * This one cannot be reached through `readVenusFactsAt`, which pins
   * `facts.block` to the block it was asked for — which is exactly why the
   * guard needs its own test. The verifier takes a reader as an argument, and
   * the defect it is written against is a reader that falls back to the head
   * when the historical read fails and hands the result over as though it
   * belonged to the block that was asked for. Without this test, removing the
   * check changes nothing the rest of the suite notices.
   */
  const f = fixture('01-correct-report.json');
  const { sealed } = buildRun(f);
  const facts = factsOf(f);
  const head = 129_270_000n;

  const result = await replayArtifact({
    sealed,
    readFactsAt: async (): Promise<VenusEvidence> => ({
      available: true,
      // Everything about this reading is right except which block it is of.
      facts: { ...facts, pool: CHECKED_POOL, block: head, blockHash: facts.blockHash },
    }),
  });
  assert.equal(result.verdict, 'not-verified');
  assert.match(result.reasons.join(' '), /came back for block 129270000, not the block 129170001 the receipt names/);
  assert.match(result.reasons.join(' '), /not evidence about this receipt/);
  assert.equal(result.checks, null, 'nothing is recomputed from a reading of the wrong block');

  // The control: the same reader, answering for the block it was asked for.
  const honest = await replayArtifact({
    sealed,
    readFactsAt: async (): Promise<VenusEvidence> => ({ available: true, facts: { ...facts, pool: CHECKED_POOL } }),
  });
  assert.equal(honest.verdict, 'agreed', honest.reasons.join(' '));
});

test('3c. a node that serves no header for the block is not verified either', async () => {
  const f = fixture('01-correct-report.json');
  const { sealed } = buildRun(f);
  const path = writeJson('headerless.json', sealed);

  const { code, out, flat } = await replay(path, stubOptionsFor(f, { withholdHeader: true }));
  assert.equal(code, 2, out);
  assert.match(flat, /served no hash for block 129170001/);
  assert.match(flat, /the same block number on another chain/);
});

test('3d. a block the chain has not reached is not verified, and is not read at the head', async () => {
  const f = fixture('01-correct-report.json');
  const { sealed } = buildRun(f);
  const path = writeJson('ahead.json', sealed);

  const { code, out, flat, node } = await replay(path, stubOptionsFor(f, { head: 129_000_000n }));
  assert.equal(code, 2, out);
  assert.match(flat, /which this chain has not reached/);
  assert.equal(node.callBlocks.length, 0, 'no state was read for a block that does not exist');
});

/* ---------- 4. a tampered receipt is refused outright ---------- */

test('4. a receipt edited after sealing is refused before anything is read', async () => {
  const declared = fixture('09-tampered-artifact.json');
  const base = buildRun(fixture("01-correct-report.json"));

  for (const edit of declared.edits!) {
    const sealed = clone(base.sealed) as SealedArtifact;
    if (edit.guard === 'checkArtifactIntegrity') {
      const row = sealed.artifact.checks.find((c) => c.id === 'hf.value');
      row!.observed = String(edit.to);
      if (edit.reseal === 'forged-hash') {
        const forged = sealArtifact(sealed.artifact).artifactHash;
        sealed.artifactHash = `0x${forged.slice(2, 65)}${forged[65] === '0' ? '1' : '0'}`;
      }
    } else {
      const artifact = clone(base.sealed.artifact) as ProofRunArtifact;
      artifact.criteria.find((c) => c.id === 'hf.value')!.check.tolerance = edit.to as number;
      const resealed = sealArtifact(artifact);
      sealed.artifact = resealed.artifact;
      sealed.artifactHash = resealed.artifactHash;
    }
    const path = writeJson(`tampered-${edit.name}.json`, sealed);
    const { code, out, flat, node } = await replay(path, stubOptionsFor(fixture('01-correct-report.json')));
    assert.equal(code, 4, `${edit.name}\n${out}`);
    assert.match(out, /^Tampered$/m, edit.name);
    assert.equal(node.methods.length, declared.expect.chainReadsBeforeRefusal, `${edit.name}: a forged receipt must not cause a chain read`);
    assert.doesNotMatch(out, /Checks re-run/, edit.name);
    if (edit.guard === 'checkSpecIntegrity') {
      assert.match(flat, /criteria do not hash to the spec this receipt names/, edit.name);
      assert.match(flat, /The receipt itself is intact/, edit.name);
    } else {
      assert.match(flat, /does not hash to the value it carries/, edit.name);
    }
  }

  // The control: unedited, the same artifact verifies against the same node.
  const path = writeJson('untampered.json', base.sealed);
  const clean = await replay(path, stubOptionsFor(fixture('01-correct-report.json')));
  assert.equal(clean.code, 0, clean.out);
});

test('4b. a file that is not a sealed artifact is unreadable, not a pass', async () => {
  const cases: Array<[string, unknown]> = [
    ['null.json', null],
    ['array.json', []],
    ['bare.json', { hello: 'world' }],
  ];
  for (const [name, value] of cases) {
    const path = writeJson(name, value);
    const { code, out } = await replay(path, stubOptionsFor(fixture('01-correct-report.json')));
    assert.equal(code, 5, `${name}\n${out}`);
    assert.match(out, /^Unreadable$/m, name);
  }

  const bad = join(dir, 'not-json.json');
  writeFileSync(bad, 'this is not json');
  const { code, flat } = await run([bad, '--rpc', 'http://127.0.0.1:1']);
  assert.equal(code, 64, flat);
  assert.match(flat, /could not be read as JSON/);
});

/* ---------- 5. contradictions are unresolved, never a pass ---------- */

test('5. two readings of one block that differ are reported as unresolved', async () => {
  const f = fixture('01-correct-report.json');
  const { sealed } = buildRun(f);
  const path = writeJson('contradicted.json', sealed);

  /*
   * A node that reads a different health factor at the same block, with the
   * same block hash. One of the two is wrong and the verifier cannot tell
   * which, so it must not prefer the receipt because it is written down nor
   * the fresh reading because it is fresh.
   */
  const stub = stubOptionsFor(f);
  const { code, out, flat } = await replay(path, {
    ...stub,
    position: { ...stub.position!, healthFactor: 1.4012 },
  });
  assert.equal(code, 3, out);
  assert.match(out, /^Unresolved$/m);
  assert.match(flat, /Where the two runs disagree/);
  assert.match(flat, /hf\.value: the receipt says passed, the replay says failed/);
  assert.match(flat, /nothing here can tell which/);
  assert.match(flat, /not preferred because it is written down/);
  assert.doesNotMatch(out, /^Verified$/m);
});

test('5b. a receipt whose summary does not follow from its own rows is unresolved', async () => {
  /*
   * The stored verdict is not evidence for the stored rows, and a reader
   * believes a headline over a detail. A receipt claiming "verified" above
   * rows that come to "unverifiable" is the forgery that needs no editing of
   * any figure, so it is caught by recomputing the summary rather than
   * reading it.
   */
  const f = fixture('01-correct-report.json');
  const artifact = clone(buildRun(f).sealed.artifact) as ProofRunArtifact;
  assert.equal(artifact.state, 'verified');

  /*
   * Both directions, because only one of them is the dangerous one and a
   * test of that one alone would not notice a check that had stopped
   * comparing. A receipt downgraded to "mismatch" is a libel on the agent; a
   * receipt upgraded to "verified" over rows that do not support it is the
   * forgery a buyer acts on. Neither may be reconciled in the receipt's
   * favour, and neither costs the node a request.
   */
  for (const [claimed, rows] of [
    ['mismatch', 'verified'],
    ['unverifiable', 'verified'],
  ] as const) {
    artifact.state = claimed;
    const path = writeJson(`self-contradicting-${claimed}.json`, sealArtifact(artifact));
    const { code, out, flat, node } = await replay(path, stubOptionsFor(f));
    assert.equal(code, 3, out);
    assert.match(out, /^Unresolved$/m);
    assert.match(flat, new RegExp(`summary says “${claimed}”, but its own rows come to “${rows}”`));
    assert.equal(node.methods.length, 0, 'a receipt that disagrees with itself is settled without a chain read');
  }

  // The control: with the summary its rows actually come to, the same receipt
  // reaches the chain and agrees.
  artifact.state = 'verified';
  const honest = writeJson('self-consistent.json', sealArtifact(artifact));
  const after = await replay(honest, stubOptionsFor(f));
  assert.equal(after.code, 0, after.out);
});

/* ---------- 6. a receipt from another build is not replayed by this one ---------- */

test('6. a version apart from this build is not verified, and says which version moved', async () => {
  const declared = fixture('10-changed-verifier-version.json');
  const f = fixture('01-correct-report.json');

  for (const change of declared.changes!) {
    const artifact = clone(buildRun(f).sealed.artifact) as ProofRunArtifact;
    if (change.field === 'versions.verifier') artifact.versions.verifier = change.to;
    else if (change.field === 'versions.criteria') artifact.versions.criteria = change.to;
    else artifact.version = change.to as ProofRunArtifact['version'];
    const path = writeJson(`version-${change.name}.json`, sealArtifact(artifact));

    const { code, out, flat, node } = await replay(path, stubOptionsFor(f));
    assert.equal(code, 2, `${change.name}\n${out}`);
    assert.match(out, /^Not verified$/m, change.name);
    assert.match(flat, new RegExp(change.to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), change.name);
    assert.match(flat, /absence of a comparable run and not a disagreement the receipt earned/, change.name);
    assert.doesNotMatch(out, /^Unresolved$/m, `${change.name}: a version gap must not read as an accusation`);
    assert.equal(node.methods.length, 0, `${change.name}: no chain read for a receipt this build cannot replay`);
  }

  // The control: on this build's own versions, the same artifact verifies.
  const path = writeJson('versions-current.json', buildRun(f).sealed);
  const current = await replay(path, stubOptionsFor(f));
  assert.equal(current.code, 0, current.out);
});

test('6b. a receipt about another protocol or another Venus deployment is not verified', async () => {
  const f = fixture('01-correct-report.json');
  for (const [name, mutate] of [
    ['protocol', (a: ProofRunArtifact) => {
      (a.subject as { protocol: string }).protocol = 'aave-v3';
    }],
    ['deployment', (a: ProofRunArtifact) => {
      a.subject.deployment = '0x0000000000000000000000000000000000000bad';
    }],
  ] as Array<[string, (a: ProofRunArtifact) => void]>) {
    const artifact = clone(buildRun(f).sealed.artifact) as ProofRunArtifact;
    mutate(artifact);
    const path = writeJson(`subject-${name}.json`, sealArtifact(artifact));
    const { code, out, flat, node } = await replay(path, stubOptionsFor(f));
    assert.equal(code, 2, `${name}\n${out}`);
    assert.equal(node.methods.length, 0, name);
    assert.match(flat, name === 'protocol' ? /reads Venus's Core Pool only/ : /more than one Comptroller has existed/, name);
  }
});

/* ---------- 7. the delivered file, when the buyer has it ---------- */

test('7. given the delivered file, both halves of the comparison are re-derived', async () => {
  const f = fixture('01-correct-report.json');
  const built = buildRun(f);
  const path = writeJson('with-delivery.json', built.sealed);
  const delivery = join(dir, 'delivery.json');
  writeFileSync(delivery, built.manifestText);

  const { code, out, flat } = await replay(path, stubOptionsFor(f), ['--deliverable', delivery]);
  assert.equal(code, 0, out);
  assert.match(out, /^Verified$/m);
  assert.match(flat, /re-read from the delivered file supplied, which hashes to the deliverable the receipt names/);
  assert.match(flat, /Both halves of the comparison were re-derived/);
  assert.doesNotMatch(flat, /taken from the rows the receipt records/);
});

test('7b. a file that is not the delivery the receipt judged is refused', async () => {
  const f = fixture('01-correct-report.json');
  const built = buildRun(f);
  const path = writeJson('wrong-delivery.json', built.sealed);
  const other = join(dir, 'other-delivery.json');
  // The confidently wrong report, which hashes to something else entirely.
  writeFileSync(other, manifestOf(fixture('02-plausible-wrong-report.json')));

  const { code, out, flat } = await replay(path, stubOptionsFor(f), ['--deliverable', other]);
  assert.equal(code, 2, out);
  assert.match(flat, /does not hash to the deliverable this receipt names/);
  assert.match(flat, /Checking its figures would be checking a different file/);
  assert.doesNotMatch(out, /Checks re-run/);
});

test('7c. without the delivered file, a receipt that records no figure says so instead of guessing', async () => {
  /*
   * The unsupported-market receipt settles nothing but the block, so there is
   * no figure in it to restate as the report's claim. Inventing one from the
   * subject would be the replay making up the half it cannot see.
   */
  const f = fixture('06-unsupported-market.json');
  const { sealed, manifestText } = buildRun(f);
  const path = writeJson('no-figure.json', sealed);

  const { code, out, flat } = await replay(path, stubOptionsFor(f));
  assert.equal(code, 2, out);
  assert.match(flat, /records no figure for the health factor the report gave/);
  assert.match(flat, /Supply the delivered file with --deliverable/);

  // Given the delivery, it can be replayed, and comes out unresolved for the
  // reason the fixture names: Pokter reads the Core Pool only.
  const delivery = join(dir, 'isolated-pool-delivery.json');
  writeFileSync(delivery, manifestText);
  const withFile = await replay(path, stubOptionsFor(f), ['--deliverable', delivery]);
  assert.equal(withFile.code, 2, withFile.out);
  assert.match(withFile.out, /Checks re-run/);
  assert.match(withFile.flat, /not-verified hf\.value/);
});

test('7d. a report too coarse to compare stays unresolved on replay', async () => {
  const f = fixture('03-bad-decimals.json');
  const built = buildRun(f);
  const path = writeJson('coarse.json', built.sealed);
  const delivery = join(dir, 'coarse-delivery.json');
  writeFileSync(delivery, built.manifestText);

  // Both ways: rebuilt from the receipt's rows, and re-read from the delivery.
  // The first is the one that could go wrong silently — the rebuilt claim has
  // to keep the single decimal place the report stated, or the precision guard
  // stops firing and a figure too coarse to check starts collecting verdicts.
  for (const extra of [[], ['--deliverable', delivery]]) {
    const { code, out, flat } = await replay(path, stubOptionsFor(f), extra);
    assert.equal(code, 2, out);
    assert.match(flat, /not-verified hf\.value/, JSON.stringify(extra));
    assert.match(flat, /Stated to 1 decimal place/, JSON.stringify(extra));
  }
});

/* ---------- 8. the invocation itself ---------- */

test('7e2. a receipt about another account is replayed as the disagreement it recorded, not quietly corrected', async () => {
  /*
   * The subtlest of the rebuild cases, and the only one a mutation found
   * uncovered. Where the receipt records an account disagreement, the address
   * the *report* named is in the row and has to go back into the rebuilt
   * claim. Fill in the subject's own address instead and the replay checks a
   * report that was about another wallet against the right one, finds nothing
   * wrong, and reports the receipt as contradicted — turning a correct
   * finding against an agent into an accusation against the receipt.
   *
   * The failure this guards is the one Pokter already met once: a report
   * about the agent's own provider wallet came within tolerance of a pass on
   * job 97:1517, which is why the account is checked before any figure.
   */
  const f = clone(fixture('01-correct-report.json'));
  f.report!.account = '0x000000000000000000000000000000000000dead';
  const built = buildRun(f);
  const row = built.sealed.artifact.checks.find((c) => c.id === 'binding.account');
  assert.equal(row?.outcome, 'failed', 'the receipt records the disagreement');
  assert.equal(row?.observed.toLowerCase(), '0x000000000000000000000000000000000000dead');
  assert.equal(built.sealed.artifact.state, 'mismatch');

  const path = writeJson('other-account.json', built.sealed);
  const stub = stubOptionsFor(fixture('01-correct-report.json'));

  /*
   * From the rows alone it cannot be replayed, and that is the honest answer
   * rather than a shortfall: the checker refuses an account mismatch before
   * it compares any figure, so this receipt has no health factor in it to
   * restate as the report's claim.
   */
  const rebuilt = await replay(path, stub);
  assert.equal(rebuilt.code, 2, rebuilt.out);
  assert.match(rebuilt.flat, /records no figure for the health factor the report gave/);

  // Given the delivery, it replays as the disagreement it recorded. What must
  // never happen is the replay checking the right wallet, finding nothing
  // wrong, and reporting the receipt as contradicted.
  const delivery = join(dir, 'other-account-delivery.json');
  writeFileSync(delivery, built.manifestText);
  const { code, out, flat } = await replay(path, stub, ['--deliverable', delivery]);
  assert.equal(code, 2, out);
  assert.match(flat, /failed binding\.account report 0x0+dead\b/i);
  assert.doesNotMatch(out, /^Unresolved$/m, 'the replay agrees with the finding rather than disputing it');
  assert.doesNotMatch(flat, /passed binding\.account/);
});

test('7e. the replayed rows are built the way the receipt’s were, down to what an unsettled row says', async () => {
  /*
   * `checksFromVerification` words an unsettled row differently depending on
   * the binding: "Agreed with the agent" when the agent signed the criteria,
   * "Recorded by Pokter and not agreed by the agent" when it did not. A
   * replay that did not pass the binding through would print the wrong one of
   * those against a receipt that printed the other — a sentence about whether
   * the agent agreed to something, invented by the replay.
   *
   * The bad-decimals receipt is used because it is the one with unsettled
   * rows to compare.
   */
  const f = fixture('03-bad-decimals.json');
  const built = buildRun(f);
  assert.equal(built.sealed.artifact.binding.kind, 'signed-terms');
  const unsettled = built.sealed.artifact.checks.filter((c) => c.outcome === 'not-verified');
  assert.ok(unsettled.length >= 2, 'there are unsettled rows to compare');
  assert.ok(unsettled.some((c) => /^Agreed with the agent/.test(c.limitation ?? '')));

  const { code, out } = await replay(writeJson('rows.json', built.sealed), stubOptionsFor(f));
  assert.equal(code, 2, out);
  for (const row of unsettled) {
    if (!/^(Agreed with the agent|Recorded by Pokter)/.test(row.limitation ?? '')) continue;
    assert.ok(out.includes(row.limitation as string), `the replay did not reproduce the row for ${row.id}: ${row.limitation}`);
  }
  assert.doesNotMatch(out, /Recorded by Pokter and not agreed by the agent/, 'the agent did sign these criteria');
});

test('8. usage, help and the endpoint name', async () => {
  const help = await run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /ProofRun independent verifier/);

  for (const args of [[], ['--rpc'], ['--nope', 'x'], ['a.json', 'b.json'], ['--deliverable']]) {
    const { code, lines } = await main(args);
    assert.equal(code, 64, JSON.stringify(args));
    assert.match(lines.join('\n'), /npx tsx scripts\/proofrun-verify\.mts/, JSON.stringify(args));
  }

  /*
   * A NodeReal URL carries its key in the path, and so may a URL a buyer
   * passes. The output names the endpoint by origin so a credential does not
   * end up in terminal scrollback or in whatever the output is pasted into.
   */
  const f = fixture('01-correct-report.json');
  const path = writeJson('endpoint.json', buildRun(f).sealed);
  const { code, out } = await replay(path, stubOptionsFor(f), [], '/v1/a-secret-key');
  assert.equal(code, 0, out);
  assert.match(out, /endpoint\s+http:\/\/127\.0\.0\.1:\d+$/m);
  assert.doesNotMatch(out, /a-secret-key/);
});

test('8b. the verifier speaks to the endpoint it was given and to nothing else', async () => {
  const f = fixture('01-correct-report.json');
  const path = writeJson('calls.json', buildRun(f).sealed);
  const { code, out, node } = await replay(path, stubOptionsFor(f));
  assert.equal(code, 0, out);
  // Read-only, and only the reads the position needs.
  assert.deepEqual([...new Set(node.methods)].sort(), ['eth_blockNumber', 'eth_call', 'eth_getBlockByNumber']);
  assert.ok(!node.methods.some((method) => /send|sign|account|personal|unlock/i.test(method)));
});

test('8c. as a command: the exit codes a script would branch on are the process’s own', async () => {
  /*
   * Everything above drives `main` in this process, which is the whole of the
   * command except for the boundary itself. These two spawn it, so that an
   * exit code a shell would see is the one asserted — the agreement case,
   * where zero has to mean agreement and nothing else, and the forged case,
   * where a non-zero code is the only thing standing between a tampered
   * receipt and a script that treats silence as a pass.
   */
  const f = fixture('01-correct-report.json');
  const built = buildRun(f);
  const agreed = await verify(writeJson('spawned-agreed.json', built.sealed), stubOptionsFor(f));
  assert.equal(agreed.code, 0, agreed.out);
  assert.match(agreed.out, /^Verified$/m);

  const sealed = clone(built.sealed) as SealedArtifact;
  sealed.artifact.checks.find((c) => c.id === 'hf.value')!.observed = '1.3512';
  const tampered = await verify(writeJson('spawned-tampered.json', sealed), stubOptionsFor(f));
  assert.equal(tampered.code, 4, tampered.out);
  assert.match(tampered.out, /^Tampered$/m);
  assert.notEqual(agreed.code, tampered.code, 'the two cases a script must tell apart do not share a code');
});

/*
 * A forged receipt is forged whether or not you have an archive node.
 *
 * The endpoint check sat in front of the integrity check that needs no
 * endpoint, so running the verifier on a tampered receipt without
 * `--rpc` answered "nothing was read, so nothing about the receipt has
 * been established either way". Something had been established: the
 * bytes are not the bytes that were sealed. It is also the likeliest
 * invocation — somebody handed a receipt, running it before finding an
 * archive node — so the one case most likely to be hit was the one that
 * stayed quiet.
 *
 * Both directions are pinned, because a fix that refused everything
 * offline would be no better than one that refused nothing.
 */
test('tampering is reported without an endpoint, and an intact receipt still is not', async () => {
  const base = buildRun(fixture('01-correct-report.json'));

  const forged = clone(base.sealed) as SealedArtifact;
  forged.artifact.checks.find((c) => c.id === 'hf.value')!.observed = 'edited';
  const tamperedPath = writeJson('offline-tampered.json', forged);
  const tampered = await run([tamperedPath]);
  assert.equal(tampered.code, 4, `a forged receipt without an endpoint exited ${tampered.code}, not 4:\n${tampered.out}`);
  assert.match(tampered.flat, /Tampered/);
  assert.doesNotMatch(tampered.flat, /nothing about the receipt has been established either way/);
  assert.doesNotMatch(tampered.flat, /No endpoint was given/, 'the endpoint message pre-empted the integrity verdict');

  /* The control: a fix that refused everything offline would be no
     better than one that refused nothing. */
  const intactPath = writeJson('offline-intact.json', base.sealed);
  const intact = await run([intactPath]);
  assert.equal(intact.code, 2, `an intact receipt without an endpoint exited ${intact.code}, not 2:\n${intact.out}`);
  assert.match(intact.flat, /No endpoint was given/);
});
