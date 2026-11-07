# Pokter Discord — safety baseline

Configuration of record for the Pokter community server. Apply it in Discord;
nothing here is code. The bot work in phase 2 assumes this is already in place.

## Why this comes before the bot

The invite is already public. `discord.gg/UMaXkB7Pjb` ships in the site footer
(`src/lib/social/links.ts`) and Scout hands it out on Telegram, so the server is
discoverable by anyone reading pokter.xyz. Exposure is live whether or not the
server is ready for it.

**The window that matters right now:** Set and Earn closed 5 November and
results land after 13 November. A campaign that has ended, with rewards not yet
distributed and participants watching for news, is the single most reliable
setup for a claim-page scam. Expect "claim your Set and Earn rewards" posts and
DMs between now and the results. The keyword rules below exist mainly for this.

## Threat model

Ordered by how likely it is to cost someone money.

1. **Fake rewards claim.** "Set and Earn payouts are live, connect here."
   There is no claim page. Results are published by Pokter, and nothing about
   them asks anyone to connect a wallet.
2. **A Pokter token.** There isn't one. Pokter settles hires in Binance-Peg
   stablecoins; it has never issued a token. Any contract calling itself Pokter
   is not Pokter.
3. **"Pay me directly, skip escrow."** This one attacks the product, not just
   the member. Every hire is funded by the buyer, in the buyer's own wallet,
   into ERC-8183 escrow on pokter.xyz. An agent or builder soliciting a direct
   transfer in Discord is either a scam or a builder who needs correcting in
   public, and the difference matters less than the correction.
4. **Fake support DMs.** Pokter does not open DMs for support. Nobody from
   Pokter will DM first about a job, a payout or a problem.
5. **Impersonation.** Of the team, of moderators, and of listed agents —
   display names and avatars are trivially copied.
6. **Wallet drainers dressed as verification.** "Connect to verify your agent",
   "re-validate your identity", "sync your wallet". Verifying an agent on Pokter
   is a signature, never an approval and never a transfer.
7. **Compromised members.** A real member's account posts a link at 3am. This is
   why link posting is a role, not a default.

## 1. Server safety settings

Settings → Safety Setup. Discord moves these labels around; match by meaning.

| Setting | Value | Why |
|---|---|---|
| Verification level | **High** (member of the server for 10+ minutes) | Blocks throwaway join-and-DM accounts. *Highest* requires a verified phone and will cost you legitimate builders. |
| Explicit media filter | Scan from all members | |
| Raid protection | On | Catches join waves |
| DM spam detection | On, strictest available | The highest-value single switch. Most scams here arrive as a DM within seconds of the join. |
| Default notifications | Mentions only | |
| `@everyone` / `@here` | Moderators only | Remove the permission from `@everyone` |

The invite in the footer must be set to **never expire, unlimited uses**.
Changing it means a code change and a deploy, so treat the invite as fixed and
respond to abuse with server settings rather than invite rotation.

## 2. AutoMod rules

Server Settings → AutoMod. Every rule's alert action should target
`#mod-alerts`.

### Rule A — Links are a privilege, not a default

**The most effective rule in this document.** Keyword rule matching `http*://*`
and `discord.gg/*`, action **block + alert**, with `@Member`, `@Builder` and
`@Moderator` exempt.

A fresh account cannot post a link at all. Members who have been around can.
This defeats drive-by drainer links without needing to guess their domains,
and it keeps working when the domains change — which they do daily.

### Rule B — Pokter scam keywords

Keyword rule, action **block + alert + timeout (1 hour)**.

```
*claim*reward*      *claim*airdrop*     *airdrop*live*
*rewards*live*      *claim*payout*      *set and earn*claim*
*seed phrase*       *secret phrase*     *recovery phrase*
*private key*       *12 word*           *24 word*
*connect*verify*wallet*   *validate*wallet*   *sync*wallet*
*restore*wallet*
$pokter             *pokter token*      *pokter coin*
*open*a*ticket*     *support*ticket*
```

`*private key*` will occasionally block a legitimate warning. Let it — the
message is blocked, not the member, and `#mod-alerts` shows you what happened.
Over-blocking here is the correct trade.

### Rule C — Member profile

Member Profile rule, block these in display names and nicknames:

```
*support*   *admin*   *moderator*   *official*   *giveaway*   *announcement*
*helpdesk*  *ticket*
```

Impersonation starts with the name. This stops it at the door.

### Rule D — Mention spam

Limit **4** mentions, action block + alert.

### Rule E — Suspected spam content

On, action block + alert.

## 3. Roles

Four roles. Resist adding more.

| Role | Granted by | Can |
|---|---|---|
| `@Moderator` | By hand | Everything except Administrator |
| `@Builder` | Wallet signature proving agent ownership (phase 3) | Post links, post in `#builders` |
| `@Member` | Moderation bot, after an account-age and time-in-server gate | Post links, embed, attach, react |
| `@everyone` | Join | Read, and post plain text in `#general` |

`@everyone` should **not** have: Embed Links, Attach Files, Add Reactions, Use
External Emoji, Create Public Threads, or Change Nickname.

`@Builder` is the one worth building. `/api/builders/verify` already runs
challenge → signature → `registryOwner`, so a builder can prove they control an
agent's owner wallet. Once the role exists, impersonating a known builder in
this server costs an agent wallet rather than a copied avatar.

## 4. Channels

The server already has six. Keep them — a new server with twenty channels reads
as abandoned. Two changes and one addition:

| Channel | Access | Change |
|---|---|---|
| `#start-here` | Read-only | **Move to the top.** New joins currently land in `#general` and never see the rules. |
| `#announcements` | Read-only, moderators post | — |
| `#general` | Everyone reads and writes | — |
| `#agent-showcase` | Everyone reads, `@Builder` and `@Moderator` post | Showcase posts are listings. Gate posting so the channel cannot be used to advertise an agent that does not exist. |
| `#help-and-feedback` | Everyone | Pin: nobody from Pokter will DM you from here. |
| `#builder-support` | Everyone | Same pin. Support channels are where support scams start. |
| `#mod-alerts` | **Create this.** Moderators only. | AutoMod alert target. Nothing works without somewhere for the alerts to land. |

Scout answers slash commands in all of these. AI chat is the exception: it
runs in a direct message with Scout, and in one channel only if
`POKTER_DISCORD_AI_CHANNEL_ID` names it. `#help-and-feedback` is the candidate
if you want one; leaving it unset keeps AI chat to direct messages.

`#receipts`, a read-only feed of settled hires, is still to come.

## 5. The pinned notice

Post in `#start-here`, pin it, and link it from the server description.

> **Read this before you do anything else.**
>
> **Pokter will never DM you first.** Not about a job, not about a payout, not
> about a problem with your agent. Anyone who does is not Pokter, whatever their
> name and avatar say.
>
> **There is no Pokter token and no airdrop.** Pokter settles hires in
> stablecoins on BNB Chain. Any token, claim page or reward link calling itself
> Pokter is not Pokter.
>
> **Nobody needs your keys.** Not Pokter, not a moderator, not an agent. Your
> seed phrase, your private key, or a signature that grants spending beyond one
> job — anything asking for those on a page that looks like Pokter is not
> Pokter.
>
> **Hires happen on pokter.xyz, in your own wallet.** You review the network,
> token, amount and deadline, and you fund one escrow job yourself. If someone
> here asks you to send payment directly instead, that is not how Pokter works
> and we would like to know about it.
>
> **Scout is the only Pokter bot here, and it only answers you.** Type `/help`
> to see what it does. Scout replies to a command you ran; it never starts a
> conversation, never DMs you, and never sends a payment or claim link. A bot
> that messages you first is not Scout.
>
> **Report rather than argue.** Tag a moderator. You will not be blamed for
> raising something that turns out to be nothing.

## 6. Moderation bot

Pick one established moderation bot. The job is: account-age gate, join
verification, raid mode, link filtering with role exemptions, and a mod log.
Wick and Dyno both cover this; Wick's anti-nuke and DM-scam handling is the
stronger of the two for a server holding financial conversation.

**Never grant a bot Administrator.** Grant the specific permissions it needs and
nothing else. A compromised bot holding Administrator is how servers get wiped,
and it is the one mistake here that cannot be undone.

This is deliberately not custom code. Moderation is not Pokter-specific, a
maintained bot does it better, and every hour spent writing one is an hour not
spent on the half of this that only Pokter can build.

The moderation bot and Scout are different bots with different jobs. The
moderation bot polices the server and needs real permissions. Scout answers
questions about the marketplace and needs almost none: it reads no messages,
holds no moderation permission, and cannot open a direct message with anyone.

## 7. Weekly check

- Read the audit log.
- Confirm no bot or integration holds Administrator.
- Read `#mod-alerts` and tune Rule B — a rule that never fires is too narrow,
  and one that fires on ordinary conversation is too broad.
- Check that the footer invite still resolves.

## 8. Scout

Scout is built: slash commands over signed HTTP interactions at
`/api/discord/interactions`, answered by the same brain that answers Telegram,
so a question asked in either place gets the same evidence and the same
refusals. Setting it up is in the README under *Public Discord bot*.

What it deliberately does not do:

- **It never opens a direct message.** Request alerts stay on Telegram for now.
  A bot that DMs members is the exact shape of the scam the notice above warns
  about, and one habit cannot be taught alongside its opposite. Turning them on
  later is one flag in the transport, not a rewrite.
- **It never posts a link the catalogue supplied.** Links come from Pokter's own
  pages, as buttons. A URL in the text of an answer could only have come from an
  agent name, a service title or a request someone wrote, so it is stripped —
  the bot is held to Rule A like everyone else.
- **It reads no conversation.** HTTP interactions carry only the command someone
  ran, so there is no message-content permission to grant and nothing to leak.

## What comes next

- **Phase 3** — `@Builder` role granted on a wallet signature, on top of
  `/api/builders/verify`. The bot needs Manage Roles for this, scoped below its
  own role, and nothing more.
- `#receipts` — a read-only feed of settled hires, so the server's own evidence
  is visible without anyone asking for it.
