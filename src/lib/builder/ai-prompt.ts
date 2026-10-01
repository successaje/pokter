export type AgentBuildPromptInput = {
  provider: 'ChatGPT' | 'Claude' | 'Gemini';
  name: string;
  description: string;
  category: string;
  protocol: 'a2a' | 'mcp';
  target?: string;
  policy?: string;
  output?: string;
};

export function createAgentBuildPrompt(input: AgentBuildPromptInput) {
  const protocolContract = input.protocol === 'a2a'
    ? 'Expose an A2A Agent Card at GET /.well-known/agent-card.json and a JSON-RPC 2.0 task endpoint over POST.'
    : 'Expose an MCP Streamable HTTP JSON-RPC endpoint supporting initialize and tools/list over POST.';

  return `You are my senior protocol engineer. Help me build a production-quality financial AI agent for Pokter, an evidence-first agent marketplace on BNB Chain.

AGENT BRIEF
- Name: ${input.name || 'Choose a clear, non-hype name'}
- Buyer outcome: ${input.description || 'Define one narrow financial outcome and a verifiable deliverable'}
- Category: ${input.category || 'Choose the most accurate financial category'}
- Scope: ${input.target || 'Define the assets, protocols, or positions it supports'}
- Operating policy: ${input.policy || 'Use conservative, explicit limits'}
- Primary deliverable: ${input.output || 'Return a structured result with evidence, assumptions, timestamps, and limitations'}
- Service protocol: ${input.protocol.toUpperCase()}

BUILD REQUIREMENTS
1. Ask me only the essential missing questions, then propose a short implementation plan before writing code.
2. Build a small, understandable TypeScript service with a health check, structured logging, input validation, timeouts, rate limits, deterministic error responses, and automated tests.
3. ${protocolContract}
4. Include a safe preview/simulate/dry-run capability so Pokter can test output without executing trades or moving funds.
5. Default to read-only behavior. Never request, print, store, or hard-code a seed phrase or private key. Put secrets in environment variables and provide a .env.example containing placeholders only.
6. Do not claim guaranteed returns, protection, or capabilities the code does not implement. Clearly disclose supported chains, protocols, assets, data sources, freshness, assumptions, and failure modes.
7. If any onchain action is included, require explicit user approval, use allowlisted contracts and bounded amounts, simulate first, and keep execution isolated from analysis. Do not invent contract addresses.
8. Return machine-readable JSON results and include sources/evidence wherever possible.
9. Provide: complete files, setup commands, tests, a local run command, a sample request/response, and deployment steps for a public HTTPS URL.
10. End with a verification checklist showing how to test the public endpoint in Pokter before ERC-8004 registration.

Work step by step. Do not skip unresolved security decisions or replace them with placeholders that look production-ready. I will review and run everything locally before deployment.

This prompt was prepared for ${input.provider}; keep the response practical and implementation-focused.`;
}
