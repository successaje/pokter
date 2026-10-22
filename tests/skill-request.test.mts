import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { pickWorkSkill } from '../src/lib/erc8183/courier-parse';
import { outboundBriefData, outboundParts, skillRequestData } from '../src/lib/erc8183/skill-request';
import { parseAgentRef } from '../src/lib/evidence/refs';

/*
 * Job 1585's own on-chain description, and the agent card that was published
 * when it failed. The card is the input contract: `agent_evidence` says it
 * takes an agent reference and gives two examples of one. Both are fixtures
 * rather than literals so the test is checking the brief that was signed and
 * the contract that was published, not a paraphrase of either.
 */
const job = JSON.parse(readFileSync('tests/fixtures/job-1585.json', 'utf8')) as { description: string };
const task = (JSON.parse(job.description) as { task: string }).task;
const card = JSON.parse(readFileSync('tests/fixtures/card-evidence.json', 'utf8')) as {
  skills: { id: string; name: string; examples?: string[] }[];
};

/** "Health Factor" is what the registry record classifies this agent as. */
const CATEGORY = 'Health Factor';

function skillFromCard(): string {
  const chosen = pickWorkSkill(card.skills, CATEGORY);
  assert.ok(chosen, 'the card declares a skill a brief can be sent to');
  return chosen.id;
}

test('job 1585 end to end: the published card resolves, the brief passes, and the payload is right', () => {
  /*
   * The whole path the money depended on, in the order it runs: the skill
   * comes from the agent's own card through the same `pickWorkSkill` the
   * courier uses, the subject comes from the signed brief, and the payload
   * is the object `sendPreparedBrief` puts on the wire.
   */
  const skillId = skillFromCard();
  assert.equal(skillId, 'agent_evidence', 'the two plumbing skills are not work skills');

  const request = skillRequestData({ skillId, task, jobId: '1585' });
  assert.equal(request.ok, true, request.ok ? '' : `refused: ${request.code}`);
  if (!request.ok) return;

  // The field the skill reads, and nothing invented beside it.
  assert.deepEqual(request.data, { protocol: 'pokter-job', job_id: 1585, agent: '97/2618' });
  assert.deepEqual(request.subject, { key: 'agent', value: '97/2618', chainId: 97, tokenId: '2618' });

  const briefData = outboundBriefData({ skillId, category: CATEGORY, task, data: request.data });
  assert.deepEqual(briefData, {
    skill: 'agent_evidence',
    task,
    task_description: task,
    category: 'Health Factor',
    read_only: true,
    constraints: 'Read-only analysis. Execute no transaction and move no funds.',
    protocol: 'pokter-job',
    job_id: 1585,
    agent: '97/2618',
  });

  // Two parts: the brief as the buyer wrote it, then the structured body.
  assert.deepEqual(outboundParts({ task, briefData }), [
    { kind: 'text', text: task },
    { kind: 'data', data: briefData },
  ]);
});

test('the subject travels in a form the card publishes, read by the agent’s own parser', () => {
  /*
   * The failure this replaces was a format mismatch, so the value is checked
   * against the contract rather than against our own expectations: it parses
   * under the parser the agent uses to accept it, and it is shaped like the
   * examples the card gives.
   */
  const request = skillRequestData({ skillId: 'agent_evidence', task, jobId: '1585' });
  assert.equal(request.ok, true);
  if (!request.ok) return;

  const examples = card.skills.find((skill) => skill.id === 'agent_evidence')?.examples ?? [];
  assert.deepEqual(examples, ['56/303779', 'eip155:97:2554'], 'the published examples, unchanged');

  const parsed = parseAgentRef(String(request.data.agent), 56);
  assert.deepEqual(parsed, { chainId: 97, tokenId: '2618' });
  assert.match(String(request.data.agent), /^\d+\/\d+$/, 'the shape of the card’s first example');
});

test('the brief itself is preserved whole, not replaced by the field', () => {
  const request = skillRequestData({ skillId: 'agent_evidence', task, jobId: '1585' });
  assert.equal(request.ok, true);
  if (!request.ok) return;
  const briefData = outboundBriefData({ skillId: 'agent_evidence', category: CATEGORY, task, data: request.data });
  assert.equal(briefData.task, task);
  assert.equal(briefData.task_description, task);
  assert.ok(task.length > 400, 'the whole brief, not a summary of it');
});

test('what the buyer is shown before funding is what delivery sends', () => {
  /*
   * The point of the preflight. The quote route runs this with no job id,
   * because there is no job yet; the courier runs it with one. Nothing else
   * may differ, or the buyer would be approving a request Pokter does not
   * go on to make.
   */
  const preflight = skillRequestData({ skillId: 'agent_evidence', task });
  const delivery = skillRequestData({ skillId: 'agent_evidence', task, jobId: '1585' });
  assert.equal(preflight.ok, true);
  assert.equal(delivery.ok, true);
  if (!preflight.ok || !delivery.ok) return;

  assert.deepEqual(preflight.subject, delivery.subject);
  const { job_id: jobId, ...rest } = delivery.data as { job_id: number };
  assert.equal(jobId, 1585);
  assert.deepEqual(preflight.data, rest, 'the job id is the only difference');
});

test('a brief that names no agent is refused, before the escrow is funded', () => {
  const request = skillRequestData({
    skillId: 'agent_evidence',
    task: 'Tell me whether this agent is any good and whether I should hire it.',
  });
  assert.equal(request.ok, false);
  if (request.ok) return;
  assert.equal(request.code, 'subject-missing');
  assert.deepEqual(request.candidates, []);
  // The refusal says what would fix it, since the buyer is the one who can.
  assert.match(request.message, /97\/2618/);
  assert.match(request.message, /agent_evidence/);
});

test('a brief naming two agents is refused and names both, rather than choosing', () => {
  const request = skillRequestData({
    skillId: 'agent_evidence',
    task: 'Compare 97/2618 against 97/2554 and tell me which has answered more often.',
  });
  assert.equal(request.ok, false);
  if (request.ok) return;
  assert.equal(request.code, 'subject-ambiguous');
  assert.deepEqual(request.candidates.sort(), ['97/2554', '97/2618']);
  assert.match(request.message, /97\/2618/);
  assert.match(request.message, /97\/2554/);
});

test('the same agent named twice is one subject, not a conflict', () => {
  const request = skillRequestData({
    skillId: 'agent_evidence',
    task: 'Report on eip155:97:2618. Everything measured about 97/2618, with sources.',
  });
  assert.equal(request.ok, true);
  if (!request.ok) return;
  assert.equal(request.data.agent, '97/2618');
});

test('a skill Pokter has no adapter for is sent what it was always sent', () => {
  /*
   * The line this change does not cross. `health_factor` publishes examples
   * too, and they are offered to buyers as briefs, but an example is not a
   * declaration that its shape is mandatory. Requiring one here would refuse
   * briefs that agents accept today, so nothing is added and nothing is
   * refused.
   */
  for (const skillId of ['health_factor', 'negotiate', 'lp_tier_plan', 'notify_funded']) {
    const request = skillRequestData({ skillId, task: 'Check the health factor for 0x0000000000000000000000000000000000000001.', jobId: '1585' });
    assert.equal(request.ok, true, `${skillId} is not gated`);
    if (!request.ok) continue;
    assert.deepEqual(request.data, { protocol: 'pokter-job', job_id: 1585 }, `${skillId} gets no invented field`);
    assert.equal(request.subject, null);
  }
});

test('before funding there is no job id, and none is invented', () => {
  const request = skillRequestData({ skillId: 'health_factor', task: 'anything' });
  assert.equal(request.ok, true);
  if (!request.ok) return;
  assert.deepEqual(request.data, { protocol: 'pokter-job' });
  assert.ok(!('job_id' in request.data), 'a quote is not a job');
});

test('a chain the caller does not serve is not a subject', () => {
  /*
   * The caller states its chains; the evidence index's own list is not used
   * in place of them. Same rule as `subjectFromBrief`, asserted through the
   * adapter the hire path actually calls.
   */
  const request = skillRequestData({ skillId: 'agent_evidence', task, chains: [56] });
  assert.equal(request.ok, false);
  if (request.ok) return;
  assert.equal(request.code, 'subject-missing');
});

test('the refusal a buyer reads is the refusal the courier throws', () => {
  /*
   * One wording, from one place. The quote route returns `message` to the
   * buyer and `askAgentByIdentity` throws it as `NotAskableError`, so a
   * refusal explained one way at quoting time cannot be explained another
   * way at delivery.
   */
  const missing = skillRequestData({ skillId: 'agent_evidence', task: 'no agent here' });
  const missingWithJob = skillRequestData({ skillId: 'agent_evidence', task: 'no agent here', jobId: '1585' });
  assert.equal(missing.ok, false);
  assert.equal(missingWithJob.ok, false);
  if (missing.ok || missingWithJob.ok) return;
  assert.equal(missing.message, missingWithJob.message);
  assert.equal(missing.code, missingWithJob.code);
});
