# Running Scout, the public Telegram bot

Scout is live as [@PokterScoutBot](https://t.me/PokterScoutBot) ("Scout by Pokter"). This page is for whoever operates it: how it behaves, how it is configured, and how to set it up again or rotate its token. What Scout offers people is in the [README](../../README.md#what-works-today), under "Scout on Telegram".

Scout is separate from the private operator-alert bot (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`). Never reuse the operator-alert token for it.

## How it behaves

**Commands.** Scout answers `/start`, `/find <task>`, `/check <Pokter agent URL or 56:ID or 97:ID>`, `/services [task]`, `/requests [task]`, `/alerts`, `/ai`, `/forget`, `/discord` and `/help`.
- Its keyboard offers Find an agent, Check an agent, Explore services, Open requests, Alerts and Help. When Gemini is configured it also offers Chat with Scout.
- Agent search uses the Discover catalogue. The category buttons include the four BNB-focused categories and an all-categories menu.
- Results come from persisted Pokter records and link to real agent, service and request pages.
- Scout labels the network, prior signed quotes and missing evidence, and says a fresh quote is needed before hiring.
- It never asks for wallet secrets, never accepts jobs, and never sends private request content.

**Request alerts.** `/alerts` offers a private-chat opt-in for newly posted public open requests only, with no wallet linking.
- New requests enter a durable outbox. The existing sweep sends them after rechecking that each is still open.
- `/alerts off` removes the subscription and its records.
- Builder-directed requests and old requests are never alerted.
- Delivery is not instant. It depends on the sweep and on Telegram being available.

**AI chat.** It is available only when `SCOUT_GEMINI_API_KEY` is set.
- **Opting in.** A private user chooses `Chat with Scout` or `/ai`, reads the Google free-tier disclosure, and taps `Enable AI chat`. Only then do ordinary private messages go to the Gemini Interactions API (`gemini-3.5-flash-lite` by default, `SCOUT_GEMINI_MODEL` to override).
- **What the model answers from.** Current catalogue results, selected Pokter guide facts and recent chat.
- **The free tier.** It may use submitted content to improve Google products, so users are told not to send confidential briefs or secrets.
- **What stays with Pokter.** Search results and links always come from Pokter, so the model cannot create hires or URLs. General Pokter questions and private-workspace questions get deterministic answers with verified page links. Recent agent searches keep only a short category context, for follow-ups.
- **Retention.** Pokter keeps the last six short turns and the latest evidence for 24 hours in `SCOUT_DB_PATH`. Expired rows are removed on later use. `/forget` deletes them at once and turns AI chat off. `/forget` clears AI chat only, not alerts.
- **What a model request contains.** Requests use `store: false`, leave out Telegram identifiers, cap the output and time out quickly.
- **Limits.** Model usage is limited per chat and globally, to stay within the free-tier quota.
- **Fallback.** Bot commands and group replies keep their deterministic behaviour. If the key or the model is unavailable, ordinary messages fall back to catalogue search or a direct Pokter link.

**Groups.** Leave BotFather privacy mode on. In a group, Scout answers commands only and does not read ordinary conversation.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `POKTER_TELEGRAM_BOT_TOKEN` | Fly secret | The bot's token from BotFather |
| `POKTER_TELEGRAM_WEBHOOK_SECRET` | Fly secret | A random 32–256 character value of letters, digits, `_` or `-`. Telegram sends it with every webhook call |
| `POKTER_TELEGRAM_BOT_USERNAME` | `fly.toml` | The bot's public username, `PokterScoutBot`. Used for commands addressed to Scout in groups |
| `SCOUT_GEMINI_API_KEY` | Fly secret | Optional. A Google AI Studio key that turns on AI chat |
| `SCOUT_GEMINI_MODEL` | Optional | Overrides the default model |
| `NEXT_PUBLIC_APP_URL` | Build | The deployed HTTPS origin, used in Scout's links |

Never put the token or the Gemini key in `fly.toml` or a client variable. Set them as Fly secrets and redeploy.

## Setting it up, or replacing the token

1. **Create the bot or rotate its token.** In Telegram, open [@BotFather](https://t.me/BotFather). Send `/newbot` for a new bot, or `/revoke` to replace the existing bot's token. Only the Telegram account that owns the bot can do this.
   - Keep the token in a secret store. Never commit it or paste it into an issue or a chat.
   - A token that has appeared in a chat or a terminal log should be rotated before production.
2. **Set the secrets.** Set `POKTER_TELEGRAM_BOT_TOKEN` and `POKTER_TELEGRAM_WEBHOOK_SECRET` in Fly. Check that `POKTER_TELEGRAM_BOT_USERNAME` matches the bot's real username. Configure all of these before you register the webhook.
3. **Set the profile and command menu.** This can be done before deploying: run `npm run telegram:configure -- --profile-only --token-stdin` and enter the token on stdin. Add `--photo-path /absolute/path/avatar.jpg` to upload a JPEG avatar.
4. **Register the webhook.** Do this only once the route is live with the new token and secret in Fly:

   ```bash
   fly ssh console -a pokter -C 'node /app/telegram-marketplace-configure.mjs'
   ```

   The script is bundled in the image. It checks the token and points Telegram at `https://pokter.xyz/api/telegram/marketplace`.
5. **Check it.** This reads back the configured commands and webhook URL without printing the token:

   ```bash
   fly ssh console -a pokter -C 'node /app/telegram-marketplace-configure.mjs --status'
   ```

   Then open the bot and try `/start`, `/find grid trading`, `/check 56:372022` and `/discord`.

## Webhook safety

- The webhook rejects requests that lack Telegram's secret header, and ignores updates that are not messages.
- If the secret or the token is missing, it fails closed.
- Telegram may retry a failed webhook call. Command responses contain only static navigation links, so a retry cannot create a request or trigger a payment.

## Scout on the website

The same Scout answers in a chat window on every page of pokter.xyz:
- **Desktop and tablet:** the figure in the bottom-right corner.
- **Phones:** a Scout tab in the bottom bar.
- **Agent pages:** "Ask Scout about this agent" under the summary.

It is `POST /api/scout` (`src/lib/scout/web-answer.ts`), sharing the model, rules and guides above.

- **Same key, separate limits.** It uses `SCOUT_GEMINI_API_KEY` and `SCOUT_GEMINI_MODEL`. Each visitor gets 12 questions per 15 minutes. The website has its own budget of 120 an hour, apart from Telegram's 120.
- **Answering without the model.** With no key, a timeout or the free quota spent, Scout answers in Pokter's own words. It gives the evidence it read or the facts of the guide the question touches. With neither, it offers the email.
- **Nothing stored.** The conversation lives in the visitor's browser, and each question carries its last six turns. A visitor accepts the Gemini notice before the first question.
- **Looking agents up.** The website reads questions the way people ask them (`src/lib/scout/web-routing.ts`), wider than Telegram's fixed phrasings:
  - "Tell me more about BrinkWatch", "What does X do?" or "Is X reliable?" looks the name up in the catalogue Discover searches. It matches strictly, from the start of an agent's name, and finds every network it is registered on.
  - "What agents can I hire for yield?" searches the catalogue, as `/find` does.
  - A capitalised name that matches nothing is answered as not listed, with a Discover search to try.
  - The model is told which links appear under its answer, and it gets an empty record when nothing was looked up, so it cannot point to a link that is not there.
- **Asking about an agent never contacts it.** The answer comes from the registry entry and Pokter's stored checks, prices and jobs (`searchById`). It never uses the agent page's dossier, which probes the agent and may ask it for a price.
- **Handing over to a person.** When a question needs the team (a stuck job, payment, account, bug or partnership), the model ends its answer with a `HANDOFF` line. The panel strips that line and offers an email to help@pokter.xyz, written in the visitor's own mail app with their question filled in. Anyone can also choose "Ask a person". Replies come from that inbox.
