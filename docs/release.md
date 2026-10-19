# Switchyard release record

October 19, 2026. Mission: The Agent Control Tower.

The first local browser run dispatched three independent genuine DeepSeek v4 Flash readings. Index produced three title operations, Caption produced three descriptions from supplied text briefs, Bulletin proposed three publications. Caption was actually killed between its first and second operation; its first write persisted and the other two did not execute. This was not an inference-in-flight kill. Reported client usage totalled 1,278 tokens and $0.0144 estimated cost, not an actual provider billing receipt. Evidence: `evidence/local-first-run.json`.

The run exposed a stale approval after Caption changed Bulletin's pending source record. The control plane refused it. A fresh-snapshot flow was added; the real browser then requested a new snapshot and approved the exact current F1 draft, including its actual generated description. No external publication occurred.

The initial 19 automated checks and TypeScript/production build passed. Local SQLite's adapter initially lacked D1's unbound `all()` shape; the worker discover/tick path identified this and it was repaired with a full worker-route integration regression.

Generated migration `0000_common_mister_fear.sql` is schema-only and applied once to the local Cloudflare preview database. Site identity is persisted; publication, hosted verification, clean public source, continuous intervention capture and saved-entry confirmation remain pending at this checkpoint.
