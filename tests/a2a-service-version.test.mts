import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { A2A_PROTOCOL_VERSION } from '../src/lib/a2a/card';
import { serviceAt } from '../src/lib/registry/service-version';

/*
 * A registration's A2A service names the A2A version its card speaks, which
 * ERC-8004 says it should. Pokter's own agents speak the version Pokter asks
 * in. A builder's agent speaks whatever its own card declares, so Studio
 * writes the version Pokter's check read from that card, and nothing when it
 * read none.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Pokter’s own cards declare one version, from one constant', () => {
  assert.equal(A2A_PROTOCOL_VERSION, '0.3.0');
  for (const path of ['lib/house/card.ts', 'lib/evidence/agent.ts', 'app/api/seller/card/route.ts']) {
    assert.match(code(path), /protocolVersion: A2A_PROTOCOL_VERSION,/, path);
    assert.doesNotMatch(code(path), /'0\.3\.0'/, path);
  }
  assert.match(code('lib/house/registration-file.ts'), /version: A2A_PROTOCOL_VERSION \}\]/);
});

test('Studio writes the version a check of this exact endpoint read, and never Pokter’s own', () => {
  const draft = code('features/studio/useAgentDraft.ts');
  assert.match(draft, /const serviceVersion = draft\.protocol === 'a2a' && endpointChecked \? preflight\?\.a2aVersion \?\? null : null;/);
  assert.match(draft, /\{ name: draft\.protocol\.toUpperCase\(\), endpoint: draft\.endpoint\.trim\(\), \.\.\.\(serviceVersion \? \{ version: serviceVersion \} : \{\}\) \}/);
  assert.match(draft, /\[draft, image, serviceVersion\],/, 'the file is rebuilt when the check changes');
  assert.doesNotMatch(draft, /A2A_PROTOCOL_VERSION/);
  /* The check reports the version, from the prober's reading of the card. */
  assert.match(code('lib/proof/prober.ts'), /a2aVersion: callable\?\.version \?\? null,/);
  assert.match(code('app/api/builders/preflight/route.ts'), /return NextResponse\.json\(\{\s*\.\.\.result,/);
});

test('an edited endpoint drops the old version and takes the one its check read', () => {
  const service = { name: 'A2A', endpoint: 'https://a.example/card.json', version: '0.3.0' };
  assert.equal(serviceAt(service, 'https://a.example/card.json', '1.0'), service, 'unchanged endpoint, unchanged entry');
  assert.deepEqual(serviceAt(service, 'https://b.example/card.json', '1.0'), { name: 'A2A', endpoint: 'https://b.example/card.json', version: '1.0' });
  assert.deepEqual(serviceAt(service, 'https://b.example/card.json', null), { name: 'A2A', endpoint: 'https://b.example/card.json' });
  assert.deepEqual(service, { name: 'A2A', endpoint: 'https://a.example/card.json', version: '0.3.0' }, 'the file it came from is not changed');

  const editor = code('features/studio/ProfileEditor.tsx');
  assert.match(editor, /setCheckedVersion\(protocol === 'a2a' \? body\.a2aVersion \?\? null : null\);/);
  assert.match(editor, /i === index \? serviceAt\(s, endpoint, checkedVersion\) : s/);
});
