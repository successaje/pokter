# MCP journeys: what was exercised, and the wallet steps left

Status as of 24 October 2026, branch `agent1/mcp-completion`. "Exercised" means
run against a server; "pending" means it needs a wallet signature from the
owner and has not happened. Nothing below was substituted with a fixture.

## Buyer journey (`/api/mcp`)

| Step | Tool | Result | Where |
| --- | --- | --- | --- |
| Handshake and discovery | `initialize`, `tools/list` | 9 tools, accurate hints | local branch and production |
| Find agents | `search_agents` "venus health factor" | 5 agents, both chains | local branch |
| Evidence | `get_agent` 97/2618 | Brinkwatch by Pokter | local branch |
| Required inputs | `prepare_brief` | skill `venus_health`, established, nothing missing | local branch |
| Signed quote | `get_quote` | 0.1 $U, BNB Chain · Testnet, `canBeFunded: true` | local branch (contacts the agent) |
| Unsigned hire | `prepare_hire` | `unsigned-awaiting-owner-approval`, approval link; a repeat returns the same request key | local branch (records the unsigned request locally) |
| Unknown agent | `hire_link` 97/99999999 | refused with `isError`, no link | local branch |
| **Funding** | approval link | **pending: owner signs in their own wallet** | — |
| Job status | `job_status` 56/57071 | SUBMITTED, deliverable URL | production, read-only |
| Delivery check | `check_delivery` 56/57071 | "Could not verify": the report names no block | production, read-only |

### The one wallet step for the buyer

1. Run `prepare_hire` for 97/2618 with `max_budget: 1`, `escrow_chain_id: 97`
   and your own `owner_address`.
2. Open the returned approval link, review it and fund it with test $U.
3. Send me the job id. I then run `job_status` and `check_delivery`, and add
   the job and transaction references here.

## Provider journey (`/api/mcp/provider`)

| Step | Who | Status |
| --- | --- | --- |
| Client setup (Claude Code) | builder | documented; the only client Pokter has run it against |
| Owner verification | builder signs a challenge | **pending** |
| Mint a scoped token | builder, at /build/automation | **pending** (needs the session above) |
| Unknown, expired and revoked tokens, cross-wallet revoke, missing scope | route tests, real route | exercised (tests/routes) |
| Unrecognised token writes nothing | route test, with a positive control | exercised |
| `find_requests` | token | pending a live token |
| `prepare_proposal` → owner signs the bid | owner wallet | **pending** |
| Award, then fund | the request's poster | **pending** |
| `prepare_deliverable` | token | pending |
| Submit on chain | provider wallet | **pending** |
| Release | the buyer | **pending** (after the review window) |
| `report_earnings` | token | pending |

### The smallest real provider walkthrough

It needs one testnet agent you own, and a second wallet acting as the poster.

1. Sign in at /build with the owner wallet, and mint a token at
   /build/automation with `requests:read proposals:write jobs:read
   deliverables:prepare earnings:read`, 1 day.
2. From the poster wallet, post a request at /workspace/requests/new.
3. In Claude Code, with the token, ask for open requests, then prepare a
   proposal. Sign the bid message in the owner wallet when asked.
4. From the poster wallet, award the bid, then hire and fund it.
5. Ask the assistant for your work, and prepare the deliverable. Submit it from
   /build/jobs with the provider wallet.
6. After the 15-minute testnet window, release from the poster wallet. Ask the
   assistant for earnings.

Retain every job id and transaction hash; I will record them here.
