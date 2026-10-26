# MCP journeys: what was exercised, and the wallet steps left

Status as of 25 October 2026, branch `agent1/mcp-completion`. "Exercised" means
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
| Funding | approval link, owner's wallet | job 97/1662 funded, tx `0xb66fe0ced51f4b8e25ed6971da9b4f4f3941a705f8a4b3cf49487eb17e655c70` (request `phr_02bd8a581bada3d7de787016dc211fbc`) | production, 25 Oct 2026 |
| Delivery, then check | `job_status`, `check_delivery` 97/1662 | SUBMITTED; "Matches checked facts" at block 129739172 (health factor 1.2999, debt, collateral, liquidatable) | production, read-only |
| Job status | `job_status` 56/57071 | SUBMITTED, deliverable URL | production, read-only |
| Delivery check | `check_delivery` 56/57071 | "Could not verify": the report names no block | production, read-only |

### The buyer wallet step: verified live

On 25 October 2026 `prepare_hire` prepared 97/2618 for owner
`0xdAb12cf15F4385188bE62bda9F00877AF4C1b32f` at 0.1 test $U under a 1 $U
ceiling. The owner funded it from the approval link as job 97/1662. Brinkwatch
delivered within a minute, and `check_delivery` recomputed the four figures
from Venus at the report's block and found them in agreement. The quote carried
no success criteria, so this says nothing yet about `signed-terms` binding.

Delivery checks of past blocks need an archive endpoint, set as the
`BSC_MAINNET_RPC_URL` Fly secret on 25 October 2026. Before that, job 97/1646
read "Could not verify" because the public node had pruned its block.

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

### The provider journey: verified live

On 25 October 2026 the owner ran the walkthrough below with Pokter Evidence
(97/2599, provider `0x93847647d7eb72a69E162117df6a8697dF53EDda`), reported as
completed without problems:

- Request: https://pokter.xyz/requests/f71d209d-83e8-4cf0-b01e-4e24a754cee3,
  budget 0.5 test $U, delivery 3 days.
- Proposal at 0.2, awarded and funded as job 97/1663, tx
  `0xcd0245b5c7c9f214b7895eaea78155055ae415c4a3be0a151dda6b7eea468b90`. The job
  carries the proposal's 0.2, not the request's 0.5.
- Deliverable staged 17:18 UTC and submitted; it meets each "Done when" line
  (agent named, read time, calls made and answered with sources, escrow
  settleability with the reason).
- Released, tx `0xc0ae4aca62f311402a9ae6af1d7f51be3d9485ab6d7fca53f98f1d56da54017d`.

**A hire from a proposal (manual step 3).** The job's deadline is
28 Oct 17:28:29 UTC: the proposal's 3 days plus the 15-minute testnet review
window from funding, so the proposal's delivery time reached the job.

Read from chain by `job_status`; the provider-side tool calls were the owner's,
in their own session, and are not independently recorded here.

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
