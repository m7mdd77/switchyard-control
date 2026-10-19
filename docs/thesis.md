# Agent operations is the discipline of revocable authority

In two years, operating AI agents will resemble running a network more than supervising a conversation. The important question will be which commitments can still be stopped, which already happened, and which require a person to change the rules.

A useful control tower must own the boundary between an agent's intention and a system's write. A pause button that only changes a badge is decoration. A kill switch that cannot reject a late result is a race condition with a reassuring label. The strongest systems will make execution authority short-lived, scoped and revocable, then prove those properties under concurrent failure.

Operators should approve concrete changes rather than personalities. Approval belongs to a specific payload, record version and destination. If another agent changes the underlying record, the old approval should expire instead of quietly authorizing a different outcome. The interface should make that interruption understandable, not hide it as friction.

Cost observability also needs honesty. Tokens can be incurred after useful execution stops. A client estimate is not a settled bill. Missing usage must remain visible rather than becoming a convenient zero.

The next generation of agent operations will combine familiar SRE practices with these new boundaries: incident containment, least authority, replayable decisions, execution leases and reconciliation of external effects. Human attention will focus on exceptions with enough evidence to act. Autonomy will become operationally credible when operators can safely interrupt it, not merely watch it.
