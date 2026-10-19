# Switchyard — keep a hand on the work

A working [Agent Control Tower](https://build.doo.ooo/challenges/agent-control-tower) for a fictional film festival. Three independent DeepSeek planners produce actual catalogue, accessibility and publication operations. A durable control plane decides what may commit. The operator can pause, resume, kill, approve exact snapshots, inspect usage and replay recorded decision summaries.

[Live operations desk](https://switchyard-control.choggyacc.chatgpt.site/) · [Public source](https://github.com/m7mdd77/switchyard-control). Release checkpoint: genuine local containment and hosted AI verified; walkthrough and competition submission are pending.

All films, teams and publication channels are fictional. No external catalogue, email, account or public festival is modified. The jobs really mutate this prototype's records. Poster descriptions use supplied text briefs, not image analysis. Decision summaries are recorded operator explanations, not private chain of thought.

## Run locally

Node.js 24.19+, no third-party runtime dependencies for the local app, control plane or tests:

```powershell
node --test test/*.test.js
node server.js
```

Open http://127.0.0.1:3311. Without an AI worker, the app accurately shows its live service offline. Existing records, export, replay and stop controls remain usable. No canned inference fallback is provided.

For genuine AI, configure an ignored `.env` from `.env.example`, then run the real supported Claude Code client through the approved AgentRouter account:

```powershell
$env:SWITCHYARD_SITE_URL='http://127.0.0.1:3311'
node --env-file=.env pc-worker.js
```

The operator may instead reuse the approved private sibling file with `--env-file=../decision-engine/.env`. Never copy that key into this repo. The generated `data/worker-token` is a separate private service credential; local server and worker share it. The public Site receives only this service credential, never the provider key.

## Operate the fleet

1. Dispatch **Programme preparation**. Index cleans three supplied titles. Caption writes short descriptions from fictional poster briefs. Bulletin requests publication of three records. Each makes a separate genuine model call with scoped inputs and output fields.
2. Pause an active agent. Remaining operations stop; resume continues the remaining plan. Pausing an active reading revokes its lease and a later resume requires a new reading. Already-started provider work may still incur charges.
3. Kill an agent. Its uncommitted work and pending approvals are revoked. Completed writes remain visible; this run cannot resume. A late result is recorded for reported usage but cannot execute.
4. Review Bulletin's exact snapshot. Approval binds the team, run, epoch, step and source record version through a SHA-256 digest. A changed record is refused. **Request fresh snapshot** recalls the stale proposal and prepares a new explicit decision. Each publication requires a separate approval.
5. Inspect a programme record to compare its draft with its immutable approved publication snapshot. Later draft edits do not silently update the published copy.
6. Dispatch **Drill: Bulletin takes the wrong channel** after the current run is finished or killed. The explicitly injected step targets the other team. The server quarantines Bulletin before publication. Its original genuine plan is retained, and the injection is labeled in the event.
7. Replay all recorded events or filter by agent. Scrub through the recorded decision and before/after details. Replay is read-only; the live fleet continues separately. Replay never calls the model or reenacts a write. Export downloads an ordinary JSON attachment containing the current records and retained events.
8. Change operating space to North Hall. It has a separate three-agent fleet and records within the same browser visitor. Another visitor receives separate workspaces. These are fictional demo teams, not an enterprise membership model.

## Architecture and constraints

The public Site's D1 database is authoritative. The local server uses real SQLite through the same SQL interface. Workspaces contain revisioned state and an append-only retained event window. Commands, claims, results and worker ticks use optimistic compare-and-swap updates; a stale revision cannot overwrite a concurrent kill or approval. Side effects are simulator record changes inside the winning state write, so there is no external effect before that commit. Production control planes would need adapter-specific cancellation, transactional outboxes and reconciliation for external systems.

The outbound PC worker discovers queued agents and runs at most three planners concurrently. Each uses its own supported-client workspace, no tools, no MCP servers, no saved session, low effort, bounded output, a 45-second application deadline and a client-estimated $0.20 invocation cap. A client may make internal continuations; one attempt is not necessarily one provider request. There is no application inference retry. A stopped or expired lease cannot regain authority from a returned plan.

The UI polls durable state and sequence-numbered event deltas every 1.2 seconds. This is a live event feed, not an SSE transport or a scripted animation. Control changes are server-authorized and do not depend on the poll timing. Displayed input, output and cache-read tokens and cost estimates are supplied by the real client. Unknown cost remains unknown; client estimates are not provider billing receipts. Cumulative per-agent usage is shown on the board and each task reading is itemized in its detail.

Anonymous HttpOnly/SameSite visitor cookies isolate demo state. Origin and CSRF checks protect browser writes. A separate service bearer protects worker routes. Commands cannot provide workspace state or model results. There is no customer import or arbitrary external URL input. Two fixed demo teams are available per visitor; cookie loss prevents recovering that visitor's records. Export is the portable copy. No provider-retention, forensic erasure or cross-device recovery guarantee is made.

Limits: five runs per team; ten admitted planner attempts per agent; 24 PC attempts and 30 hosted admissions per rolling hour, failed attempts included. Each workspace retains the latest 600 events and each agent the latest 30 reading summaries. No claim of cryptographic tamperproof history is made. The UI and records can load without the PC; new AI and scheduled execution require it awake and connected. The worker services up to 80 recently touched workspaces; this prototype has no enterprise fairness, high availability or billing settlement.

The retained Sites starter is in `site/`. Install its locked dependencies, run `node scripts/build.mjs`, then `npm run build` inside it. Preserve hosting identity, Sites build integration and immutable generated migrations. The supported-client transport and local SQL adapter are reused from Daymark; the authoritative hosted control plane, interruption epochs, concurrent planners, exact approval flow, domain, UI and event model are new.

See [methodology map](docs/methodology.md), [architecture](docs/architecture.md), [failure test](docs/failure-test.md), [two-year thesis](docs/thesis.md) and [release evidence](docs/release.md). Automated model doubles are separate from actual provider evidence.
