import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentBuildPrompt } from '../src/lib/builder/ai-prompt';

test('creates a category-aware A2A build prompt with safety constraints', () => {
  const prompt = createAgentBuildPrompt({
    provider: 'Claude',
    name: 'Treasury Sentinel',
    description: 'Returns a sourced treasury risk report.',
    category: 'yield',
    protocol: 'a2a',
    target: 'Stablecoins',
    policy: 'Capital preservation',
    output: 'Risk report',
  });

  assert.match(prompt, /Treasury Sentinel/);
  assert.match(prompt, /GET \/\.well-known\/agent-card\.json/);
  assert.match(prompt, /Never request, print, store, or hard-code a seed phrase or private key/);
  assert.match(prompt, /public HTTPS URL/);
  assert.match(prompt, /Claude/);
});

test('uses the MCP discovery contract when MCP is selected', () => {
  const prompt = createAgentBuildPrompt({
    provider: 'Gemini',
    name: '',
    description: '',
    category: '',
    protocol: 'mcp',
  });

  assert.match(prompt, /MCP Streamable HTTP JSON-RPC/);
  assert.match(prompt, /initialize and tools\/list/);
  assert.doesNotMatch(prompt, /GET \/\.well-known\/agent-card\.json/);
});
