# Mission evidence map

Live mission: [The Agent Control Tower](https://build.doo.ooo/challenges/agent-control-tower).

| Requirement | Implementation and actual evidence |
|---|---|
| Three agents doing distinct jobs | Independent genuine DeepSeek Index, Caption and Bulletin invocations, scoped inputs and operations. `evidence/public-normal-complete.json`. |
| Live fleet, actions, blockers and drift | Durable sequence-numbered events, live polling, per-agent mode, progress and blockers. Wrong-channel scope drift produces an explicit quarantine. |
| Approval and per-agent kill | Exact payload/source-version approval and targeted run/epoch stop authority. Real hosted stale approval was refused and refreshed. |
| Cost and tokens per agent/task | Real client input, output, cache-read usage and estimated cost; per-reading history and unknown cost preserved. Client estimates are not provider invoices. |
| Replay last steps | Filter any agent and scrub retained events, high-level decision summaries and before/after data. No hidden chain of thought is claimed; replay performs no work. |
| Concrete rogue failure | A labeled wrong-channel injection quarantines Bulletin before writing. North Hall records compared unchanged. `evidence/public-containment.json`. |
| Continuous intervention video | 90.6 seconds: resume, pause, terminal kills, new genuine readings, exact approval and replay. `evidence/walkthrough.json` describes scope and limitations. |
| Architecture and thesis | `architecture.md`, `failure-test.md`, methodology map, and `thesis.md` (244 words). |
| Multi-team awareness and export | Two isolated fictional teams per visitor, separate visitor records, ordinary JSON attachment export and authenticated worker control plane. |
| Public source and demo | Public GitHub repository and ChatGPT Site. Clean-source and release verification recorded in `release.md`. |
| Competition receipt | Final saved-entry confirmation pending; do not infer judging or an award. |
