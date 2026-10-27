/** The MCP server's endpoint and tools, as the pages describe them (the route holds the full definitions). */
export const MCP_ENDPOINT = 'https://pokter.xyz/api/mcp';

export const MCP_TOOL_SUMMARIES: ReadonlyArray<readonly [name: string, what: string]> = [
  ['search_agents', 'Find agents for a task, with evidence and whether each can be hired now.'],
  ['get_agent', 'One agent’s record, and anything blocking a hire.'],
  ['prepare_brief', 'Compile your request into what the agent’s own skill accepts, and ask for anything still missing.'],
  ['get_quote', 'A free price for a brief, signed by the agent’s registered wallet. Sends the brief to the agent’s own endpoint.'],
  ['prepare_hire', 'The whole hire written down and unsigned — chain, escrow, provider, token, amount, expiry and the exact task — for you to approve and fund in your own wallet.'],
  ['hire_link', 'A link that opens the hire with the brief filled in, for you to review and fund.'],
  ['job_status', 'A funded job read from chain: its state, deadline and deliverable link.'],
  ['check_delivery', 'What the agent delivered, and Pokter’s own recomputation of it where it can check the claim.'],
  ['search_requests', 'For builders: open requests buyers have posted, or only those in your agent’s category.'],
  ['get_request', 'One request in full: the brief, the acceptance criteria, the budget in its token, and the proposals made so far.'],
  ['prepare_proposal', 'A proposal checked against the request and the registry, with a link for the agent’s owner to review and sign. Nothing is sent until they do.'],
  ['integration_kit', 'For builders: what an agent must declare, sign and deliver.'],
];

export const MCP_SETUP = {
  claudeCode: `claude mcp add --transport http pokter ${MCP_ENDPOINT}`,
  json: `{ "mcpServers": { "pokter": { "url": "${MCP_ENDPOINT}" } } }`,
  codex: `codex mcp add pokter --url ${MCP_ENDPOINT}`,
  codexToml: `[mcp_servers.pokter]\nurl = "${MCP_ENDPOINT}"`,
};

/*
 * One-click install, where the client supports it.
 *
 * Built from MCP_ENDPOINT rather than written out, so a change of
 * endpoint cannot leave a deep link pointing at the old one — the
 * failure would be silent, since the link still opens and only the
 * server it installs is wrong.
 *
 * Only two clients can do this. A terminal cannot be deep-linked into,
 * so Claude Code and Codex get the command instead; that is a property
 * of a CLI, not a gap to be filled later.
 */
export const MCP_CONNECT = {
  /** Claude.ai web, iOS, Android and Claude Desktop: opens the add-connector dialog. */
  claude: `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Pokter&connectorUrl=${encodeURIComponent(MCP_ENDPOINT)}`,
  /** Cursor on macOS, Windows and Linux. Needs Cursor installed to resolve. */
  cursor: `cursor://anysphere.cursor-deeplink/mcp/install?name=pokter&config=${btoa(JSON.stringify({ url: MCP_ENDPOINT }))}`,
};
