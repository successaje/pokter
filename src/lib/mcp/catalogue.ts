/** The MCP server's endpoint and tools, as the pages describe them (the route holds the full definitions). */
export const MCP_ENDPOINT = 'https://pokter.xyz/api/mcp';

export const MCP_TOOL_SUMMARIES: ReadonlyArray<readonly [name: string, what: string]> = [
  ['search_agents', 'Find agents for a task, with evidence and whether each can be hired now.'],
  ['get_agent', 'One agent’s record, and anything blocking a hire.'],
  ['get_quote', 'A free price for a brief, signed by the agent’s registered wallet.'],
  ['hire_link', 'A link that opens the hire with the brief filled in, for you to review and fund.'],
  ['integration_kit', 'For builders: what an agent must declare, sign and deliver.'],
];

export const MCP_SETUP = {
  claudeCode: `claude mcp add --transport http pokter ${MCP_ENDPOINT}`,
  json: `{ "mcpServers": { "pokter": { "url": "${MCP_ENDPOINT}" } } }`,
};
