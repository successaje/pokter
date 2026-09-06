# Recording walkthrough

The operational companion to [demo-script.md](demo-script.md). That file is what
you *say*; this is what you *do* — where the cursor goes, how long each beat
runs, and what to do when something misbehaves on camera.

Figures verified against production on 2 September 2026. Re-run the checks in
**Pre-flight step 6** on the day: sweeps run every two hours, so the probe
counts move on their own.

---

## Pre-flight (10 minutes before)

1. **Warm the server.** Load `https://pokter.fly.dev/` and confirm it returns in
   about a second. A cold machine takes ~40s to prime its cache — that must not
   happen mid-take.
2. **Set the window to 1280×800 or larger.** Below 1024 the compare table gains
   a horizontal scrollbar and the hero cards restack.
3. **Pick a theme and commit.** Toggle is in the header. Dark reads better in
   video; light reads better if it will be projected. Do not switch mid-take.
4. **Silence everything.** Notifications, calendar alerts, Slack. A banner
   across a permission screen is the one frame you cannot cut around.
5. **Decide the wallet path now.**
   - *Passkey* — stronger story, real device custody, but the biometric prompt
     is a system dialog you cannot script. Rehearse it once.
   - *Browser wallet on BSC testnet* — more predictable.
   - *Neither* — you can still narrate the permission panel, which is the part
     that matters. Do not pretend a grant happened.
6. **Re-verify the spoken numbers.** Run:

   ```bash
   npm run figures
   ```

   It reads the deployed site and prints what is currently true. Sweeps run
   every two hours, so anything written into a document — including the table
   below — starts ageing immediately. The table is a snapshot, not a source.

| Spoken in the script | Value on 2 Sep 2026 |
| --- | --- |
| registered agents | 306.4K |
| agents monitored | 38 |
| "twelve relevant agents, four match" | 12 found, 4 match |
| "Pokter Score 87, three of five dimensions" | 87 / 100 |

   If a figure has moved, change the narration. Never read a stale number over
   a live screen — that is precisely the failure this product exists to prevent.

7. **Open six tabs, in this order.** You should never type a URL on camera.

```
1  https://pokter.fly.dev/
2  https://pokter.fly.dev/discover?objective=protect&capital=5000&risk=medium&horizon=30&run=1
3  https://pokter.fly.dev/agents/56/302257
4  https://pokter.fly.dev/compare?agents=56:302257,56:304494,56:302258
5  https://pokter.fly.dev/hire/56/302257
6  https://pokter.fly.dev/my-agents
```

8. **Load every tab once** so they are all warm, then return to tab 1 and scroll
   back to the top.
9. **Keep BscScan open in a seventh tab** on `0x62a590ae…`, the session grant,
   in case a judge asks you to prove a transaction live.

---

## The take, beat by beat

Timings are targets, not marks to hit exactly. Running ten seconds long is fine;
rushing the evidence section is not.

### 0:00 – 0:22 · The problem · *tab 1*

| | |
| --- | --- |
| **Screen** | Landing hero, scrolled to top |
| **Do** | Nothing for three seconds — let the agent scene animate and the event cards drift in on their own |
| **Then** | One slow scroll to the ecosystem counters. They animate as they enter; if you scroll fast you will scrub past the animation and it looks static |

The counters are the beat. Land on the two of them — registered against
monitored — and let the gap sit for a second before speaking over it. Check the
current values with `npm run figures` first; they move every two hours.

### 0:22 – 0:45 · Don't trust the pitch · *tab 1*

| | |
| --- | --- |
| **Screen** | Continue scrolling to the claim-versus-evidence panel |
| **Cursor** | Rest on the left panel while you read the agent's pitch, then move deliberately across to the right |

The agent is **`bnb-lending-guardian.agent`** and it is read live, not
hardcoded — worth saying. The right panel reads **0 of 72 probes answered**,
**72 consecutive failures**, **Hiring Blocked**.

The cursor movement left-to-right *is* the argument. Make it slow.

### 0:45 – 1:10 · The brief · *tab 2*

| | |
| --- | --- |
| **Screen** | `/discover`, already run |
| **Do** | Point at the results header: *12 relevant agents, 4 match your profile* |
| **Then** | Click **Why not the others?** and let the list expand before speaking |

Do not scroll while the list expands. Let it finish, then read one or two
rejection reasons aloud. The reasons are the point, not the count.

### 1:10 – 1:45 · The evidence · *tab 3* — **the most important 35 seconds**

| | |
| --- | --- |
| **Screen** | *Brain on BNB — Venus Health Factor Monitor* |
| **Do** | Point at **Pokter Score 87 / 100**, then immediately at **Scored on 3 of 5 dimensions** underneath |
| **Then** | Click **Show breakdown** — performance and risk read *not measured* |
| **Then** | Scroll to **Why should I trust this agent?** |
| **Then** | Click one provenance tag to open its popover, then the transaction link |

This is where the submission is won or lost. Two specific things to get right:

- **Pause after "three of five dimensions."** That line is the whole thesis and
  it is easy to swallow.
- The trust rows say **Identity: onchain**, **Capabilities: estimated**
  (publisher-declared, nobody checked), **Endpoint: Pokter measured**. Naming
  the difference out loud is what separates this from a dashboard.

The page also shows **3 attestations from 2 measurers, 72/72 probes over 7
days** — good to have in your head if a judge interrupts.

### 1:45 – 2:05 · Compare · *tab 4*

| | |
| --- | --- |
| **Screen** | Three agents side by side |
| **Cursor** | Run down the highlighted column, slowly |

Point at one row reading *not measured* rather than a zero. The line worth
delivering cleanly: *a missing measurement never loses a comparison it was
never in.*

### 2:05 – 2:35 · The permission · *tabs 5 → 6*

| | |
| --- | --- |
| **Screen** | The hire flow |
| **Do** | Rest on the **Can call / Cannot call** panel — do not scroll past it |
| **Then** | Switch to tab 6, `/my-agents`, and click a grant transaction |

The "cannot" list is the differentiator; give it as much time as the "can" list.
Say plainly that the Altana account contract enforces this, not Pokter.

If you granted a session live, this is where it lands. If you did not, narrate
the panel and move to `/my-agents` for the transactions already there. Both are
honest. Do not imply a grant you did not make.

### 2:35 – 3:00 · The position · *tab 1*

| | |
| --- | --- |
| **Screen** | Back to landing, scroll to **TRANSPARENCY** |
| **Cursor** | Hold for a beat on **Reported upstream · altana-sdk#84** so it is legible |
| **Then** | Scroll to the philosophy block, then the closing headline |

**Do not click the issue link.** GitHub is not part of this take. Let the label
do the work.

Deliver the philosophy block slowly — four short sentences, a beat between each.
Then the headline, and stop. Do not add a sign-off after "Choose what deserves
your money."

---

## When something goes wrong

| Problem | What to do |
| --- | --- |
| A page takes more than 3s | Keep talking; it is a live registry, and saying so is fine. Do not sit in silence. |
| The passkey prompt fails | Say "signed by the operator key here" and continue. The interface already states which key signed — do not paper over it. |
| A number differs from your script | Read what is on screen. Never the script. |
| An agent's status changed | That is the product working. "It was answering yesterday, it is not now" is a *better* demo than a static screenshot. |
| You fluff a line | Stop, pause three seconds, restart the sentence. Silence cuts cleanly; a half-corrected sentence does not. |

---

## Do not demo these

Documented, but they cost more to explain than they return in a three-minute
take:

- **Job delivery.** Escrow is funded and visible on-chain, but jobs sit at
  `FUNDED` — the seller runtime has no poller. Say "escrowed" and move on; never
  imply a deliverable came back.
- **Grid Trading with a strict filter.** Thinnest evidence of the four
  categories. Demo Health Factor, which has the strongest.
- **The leaderboard's Overall tab** on a cold machine. Category tabs are ~3s;
  Overall fans out further. If you show rankings, open a category tab.

---

## After recording

1. Watch it once at full size. Check no notification banner appears and no
   personal browser data is legible in a tab title or bookmark bar.
2. Confirm every number you spoke matches what is on screen in that frame.
3. Upload, set to unlisted, and paste the link into the README table — it is the
   only place the video is delivered, since the submission form has no field for
   it.
4. Push that change. A README pointing at a placeholder is the single most
   likely way this gets missed.
