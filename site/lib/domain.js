export const AGENTS = ["index", "caption", "bulletin"];
export const TEAMS = ["harbour", "north"];
export const clone = (x) => structuredClone(x);
export function rule(ok, code, message) {
  if (!ok) throw Object.assign(new Error(message), { code });
}
export const names = {
  index: "Index",
  caption: "Caption",
  bulletin: "Bulletin",
};
export function seed(team = "harbour") {
  rule(TEAMS.includes(team), "team", "Unknown team.");
  const titles =
    team === "harbour"
      ? ["  TIDELINES  ", "the last ferry", "  A LIGHT AT DAWN "]
      : ["  NORTH WINDOW ", "winter reel", "  AFTER THE SNOW"];
  const briefs =
    team === "harbour"
      ? [
          "A red ferry crosses a blue harbour beneath a pale moon.",
          "Two people wait at a bright ferry terminal in heavy rain.",
          "A lighthouse beam crosses a dark coast at dawn.",
        ]
      : [
          "A person looks through a frosted window at a snowy courtyard.",
          "A small cinema marquee glows above a snow-covered street.",
          "A forest path curves between bare trees after snowfall.",
        ];
  return {
    team,
    revision: 0,
    run: 0,
    scenario: "normal",
    startedAt: null,
    agents: Object.fromEntries(
      AGENTS.map((id) => [
        id,
        {
          id,
          name: names[id],
          mode: "active",
          phase: "idle",
          epoch: 0,
          cursor: 0,
          plan: null,
          lease: null,
          nextAt: 0,
          trace: [],
          usage: {
            input: 0,
            output: 0,
            cache: 0,
            estimatedUsd: 0,
            unknownCosts: 0,
          },
          attempts: 0,
          completed: 0,
          blocker: "",
        },
      ]),
    ),
    records: titles.map((title, i) => ({
      id: "F" + (i + 1),
      title,
      brief: briefs[i],
      caption: "",
      published: false,
      version: 0,
    })),
    approvals: [],
    events: [],
    sequence: 0,
    requests: [],
    lastRunAt: 0,
  };
}
export function event(s, agent, type, summary, detail = {}, now = Date.now()) {
  s.sequence++;
  s.events.push({
    seq: s.sequence,
    run: s.run,
    at: now,
    agent,
    type,
    summary,
    detail,
  });
  if (s.events.length > 600) s.events.shift();
}
export function publicState(s) {
  const p = clone(s);
  for (const a of Object.values(p.agents)) {
    delete a.lease;
  }
  delete p.requests;
  return p;
}
function agent(s, id) {
  rule(AGENTS.includes(id), "agent", "Unknown agent.");
  return s.agents[id];
}
function revoke(s, a, mode, now) {
  a.mode = mode;
  a.epoch++;
  a.lease = null;
  if (a.phase === "planning") a.phase = "queued";
  for (const q of s.approvals)
    if (q.agent === a.id && q.status === "pending" && mode !== "paused")
      q.status = "withdrawn";
  event(
    s,
    a.id,
    mode,
    mode === "paused"
      ? "Operator paused execution."
      : mode === "killed"
        ? "Operator killed this run. Remaining work revoked."
        : "Control plane quarantined this agent.",
    { epoch: a.epoch },
    now,
  );
}
export function operator(s, c, now = Date.now()) {
  rule(
    c && typeof c === "object" && !Array.isArray(c),
    "command",
    "Invalid command.",
  );
  rule(
    ["start", "pause", "resume", "kill", "approve", "deny", "refresh"].includes(
      c.op,
    ),
    "command",
    "Unknown command.",
  );
  if (c.op === "start") {
    rule(
      Object.values(s.agents).every(
        (a) =>
          ["idle", "done", "failed"].includes(a.phase) ||
          ["killed", "quarantined"].includes(a.mode),
      ),
      "busy",
      "Finish or stop the current fleet first.",
    );
    rule(
      s.run < 5,
      "limit",
      "This workspace has reached its five-run allowance.",
    );
    rule(
      !s.lastRunAt || now - s.lastRunAt >= 15000,
      "limit",
      "Wait a moment before starting another run.",
    );
    rule(
      ["normal", "scope-escape"].includes(c.scenario),
      "scenario",
      "Unknown incident.",
    );
    const clean = seed(s.team);
    s.run++;
    s.scenario = c.scenario;
    s.startedAt = now;
    s.lastRunAt = now;
    s.records = clean.records;
    s.approvals = [];
    for (const id of AGENTS) {
      const old = s.agents[id];
      s.agents[id] = {
        ...clean.agents[id],
        epoch: old.epoch + 1,
        phase: "queued",
        usage: old.usage,
        trace: old.trace,
        attempts: old.attempts,
      };
    }
    event(
      s,
      "operator",
      "started",
      "Operator dispatched the three-agent fleet.",
      { scenario: s.scenario },
      now,
    );
    return;
  }
  if (["approve", "deny", "refresh"].includes(c.op)) {
    const q = s.approvals.find((x) => x.id === c.approval);
    rule(
      q && q.status === "pending",
      "approval",
      "This decision is no longer pending.",
    );
    const a = agent(s, q.agent);
    rule(
      a.mode === "active" && a.epoch === q.epoch,
      "revoked",
      "The agent is stopped; this approval cannot run.",
    );
    rule(
      c.digest === q.digest,
      "changed",
      "The proposed change no longer matches.",
    );
    if (c.op === "refresh") {
      q.status = "superseded";
      a.phase = "ready";
      a.blocker = "Preparing a fresh approval snapshot.";
      a.nextAt = now;
      event(
        s,
        a.id,
        "refreshed",
        "Operator recalled the old draft. A fresh exact approval is required.",
        { approval: q.id, digest: q.digest },
        now,
      );
      return;
    }
    const record = s.records.find((x) => x.id === q.step.recordId);
    if (c.op === "approve")
      rule(
        record && record.version === q.recordVersion,
        "stale",
        "The record changed. Reject this proposal and start a fresh run.",
      );
    q.status = c.op === "approve" ? "approved" : "denied";
    a.cursor++;
    a.blocker = "";
    if (c.op === "approve") {
      const before = clone(record);
      record.published = true;
      record.publication = {
        title: record.title,
        caption: record.caption,
        sourceVersion: record.version,
      };
      record.version++;
      a.completed++;
      event(
        s,
        a.id,
        "published",
        "Owner approved and published " + record.title + ".",
        { approval: q.id, digest: q.digest, before, after: clone(record) },
        now,
      );
    } else
      event(
        s,
        a.id,
        "denied",
        "Owner rejected publication. No record changed.",
        { approval: q.id, digest: q.digest },
        now,
      );
    a.phase = a.cursor >= a.plan.steps.length ? "done" : "ready";
    a.nextAt = now + 4000;
    return;
  }
  const a = agent(s, c.agent);
  rule(a.phase !== "idle", "idle", "Dispatch the fleet first.");
  if (c.op === "pause") {
    rule(
      a.mode === "active" && !["done", "failed"].includes(a.phase),
      "state",
      "This agent cannot pause.",
    );
    revoke(s, a, "paused", now);
  }
  if (c.op === "kill") {
    rule(
      !["killed", "quarantined"].includes(a.mode) && a.phase !== "done",
      "state",
      "This run is already stopped.",
    );
    revoke(s, a, "killed", now);
  }
  if (c.op === "resume") {
    rule(a.mode === "paused", "state", "Only a paused agent can resume.");
    a.mode = "active";
    a.nextAt = now + 4000;
    for (const q of s.approvals)
      if (q.agent === a.id && q.status === "pending") q.epoch = a.epoch;
    event(
      s,
      a.id,
      "resumed",
      "Operator resumed the remaining work.",
      { epoch: a.epoch },
      now,
    );
  }
}
export function claim(s, id, leaseId, now = Date.now()) {
  const a = agent(s, id);
  rule(
    a.mode === "active" && a.phase === "queued",
    "unavailable",
    "No queued planner.",
  );
  rule(a.attempts < 10, "limit", "Agent planning allowance reached.");
  a.attempts++;
  a.phase = "planning";
  a.blocker = "";
  a.lease = { id: leaseId, epoch: a.epoch, expires: now + 65000, run: s.run };
  event(
    s,
    id,
    "planning",
    "Independent DeepSeek reading started.",
    { lease: leaseId, epoch: a.epoch, attempt: a.attempts },
    now,
  );
  return {
    agent: id,
    team: s.team,
    run: s.run,
    lease: clone(a.lease),
    records: clone(s.records),
  };
}
export function validatePlan(plan, id, records) {
  rule(
    plan &&
      typeof plan === "object" &&
      !Array.isArray(plan) &&
      Object.keys(plan).every((k) => ["summary", "steps"].includes(k)),
    "plan",
    "Invalid plan shape.",
  );
  rule(
    typeof plan.summary === "string" &&
      plan.summary.length > 0 &&
      plan.summary.length <= 700 &&
      Array.isArray(plan.steps) &&
      plan.steps.length >= 1 &&
      plan.steps.length <= 3,
    "plan",
    "A bounded plan is required.",
  );
  const seen = new Set();
  for (const step of plan.steps) {
    rule(
      step && typeof step === "object" && !Array.isArray(step),
      "plan",
      "Invalid operation.",
    );
    const keys =
      id === "index"
        ? ["recordId", "title"]
        : id === "caption"
          ? ["recordId", "text"]
          : ["recordId", "channel"];
    rule(
      Object.keys(step).length === keys.length &&
        Object.keys(step).every((k) => keys.includes(k)),
      "scope",
      "Operation exceeds this agent’s scope.",
    );
    rule(
      records.some((r) => r.id === step.recordId) && !seen.has(step.recordId),
      "record",
      "Unknown or duplicate record.",
    );
    seen.add(step.recordId);
    if (id === "index")
      rule(
        typeof step.title === "string" &&
          step.title.trim().length >= 2 &&
          step.title.length <= 90 &&
          !/[<>\r\n]/.test(step.title),
        "plan",
        "Invalid title.",
      );
    if (id === "caption")
      rule(
        typeof step.text === "string" &&
          step.text.trim().length >= 12 &&
          step.text.length <= 300 &&
          !/[<>\r\n]/.test(step.text),
        "plan",
        "Invalid caption.",
      );
    if (id === "bulletin")
      rule(
        typeof step.channel === "string" && step.channel.length <= 40,
        "plan",
        "Invalid publication channel.",
      );
  }
  return clone(plan);
}
function addUsage(a, u) {
  for (const k of ["input", "output", "cache"])
    a.usage[k] += Number.isSafeInteger(u?.[k]) && u[k] >= 0 ? u[k] : 0;
  if (
    typeof u?.estimatedUsd === "number" &&
    Number.isFinite(u.estimatedUsd) &&
    u.estimatedUsd >= 0
  )
    a.usage.estimatedUsd += u.estimatedUsd;
  else a.usage.unknownCosts++;
}
export function result(s, id, leaseId, result, now = Date.now()) {
  const a = agent(s, id);
  const started = s.events.find(
    (e) =>
      e.agent === id && e.type === "planning" && e.detail.lease === leaseId,
  );
  rule(started, "lease", "Unknown planning lease.");
  rule(
    !a.trace.some((t) => t.lease === leaseId),
    "duplicate",
    "Result already recorded.",
  );
  addUsage(a, result.usage);
  const live =
    a.mode === "active" &&
    a.phase === "planning" &&
    a.lease?.id === leaseId &&
    a.lease.epoch === a.epoch &&
    a.lease.expires >= now &&
    a.lease.run === s.run;
  const trace = {
    lease: leaseId,
    at: now,
    run: started.run,
    summary: result.plan?.summary || "No usable plan returned.",
    usage: clone(result.usage || {}),
    model: "deepseek-v4-flash",
    accepted: live && !result.error,
  };
  a.trace.push(trace);
  if (a.trace.length > 30) a.trace.shift();
  if (!live) {
    event(
      s,
      id,
      "discarded",
      "Late result retained for usage; execution authority was revoked.",
      { lease: leaseId, usage: trace.usage },
      now,
    );
    return;
  }
  a.lease = null;
  if (result.error) {
    a.phase = "failed";
    a.blocker = "The AI reading failed. No fallback plan was supplied.";
    event(
      s,
      id,
      "failed",
      a.blocker,
      { code: result.error, usage: trace.usage },
      now,
    );
    return;
  }
  try {
    a.plan = validatePlan(result.plan, id, s.records);
  } catch (e) {
    a.phase = "failed";
    trace.accepted = false;
    a.blocker = e.message;
    event(
      s,
      id,
      "failed",
      "Unusable plan refused.",
      { code: e.code, usage: trace.usage },
      now,
    );
    return;
  }
  trace.plan = clone(a.plan);
  a.cursor = 0;
  a.phase = "ready";
  a.nextAt = now + 6000;
  event(
    s,
    id,
    "planned",
    a.plan.summary,
    { plan: clone(a.plan), usage: trace.usage, model: trace.model },
    now,
  );
}
export async function execute(s, id, now = Date.now()) {
  const a = agent(s, id);
  if (a.mode !== "active" || a.phase !== "ready" || a.nextAt > now)
    return false;
  const step = clone(a.plan.steps[a.cursor]);
  rule(step, "plan", "No remaining operation.");
  const record = s.records.find((r) => r.id === step.recordId);
  rule(record, "record", "Unknown record.");
  if (id === "bulletin") {
    const original = clone(step);
    if (s.scenario === "scope-escape" && a.cursor === 0)
      step.channel = s.team === "harbour" ? "north-web" : "harbour-web";
    if (step.channel !== s.team + "-web") {
      a.blocker = "Publication targeted another team. No write committed.";
      revoke(s, a, "quarantined", now);
      event(
        s,
        id,
        "scope_refused",
        a.blocker,
        {
          step,
          original,
          injected: s.scenario === "scope-escape",
          targetTeam: step.channel,
        },
        now,
      );
      return true;
    }
    const digest = await sha(
      JSON.stringify({
        team: s.team,
        run: s.run,
        agent: id,
        epoch: a.epoch,
        step,
        recordVersion: record.version,
      }),
    );
    const q = {
      id: "A" + s.run + "-" + (s.approvals.length + 1),
      agent: id,
      epoch: a.epoch,
      status: "pending",
      step,
      recordVersion: record.version,
      digest,
      created: now,
      title: record.title,
      preview: clone(record),
    };
    s.approvals.push(q);
    a.phase = "approval";
    a.blocker = "Publication needs your exact approval.";
    event(
      s,
      id,
      "approval",
      a.blocker,
      {
        approval: q.id,
        digest,
        recordVersion: record.version,
        step,
        preview: clone(record),
      },
      now,
    );
    return true;
  }
  const before = clone(record);
  if (id === "index") record.title = step.title.trim();
  else record.caption = step.text.trim();
  record.version++;
  a.cursor++;
  a.completed++;
  event(
    s,
    id,
    "committed",
    id === "index"
      ? "Catalogue title updated."
      : "Accessibility description saved.",
    { step, before, after: clone(record) },
    now,
  );
  a.phase = a.cursor >= a.plan.steps.length ? "done" : "ready";
  a.nextAt = now + 6000;
  return true;
}
export async function sha(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function expire(s, now = Date.now()) {
  let changed = false;
  for (const a of Object.values(s.agents))
    if (
      a.mode === "active" &&
      a.phase === "planning" &&
      a.lease?.expires < now
    ) {
      a.epoch++;
      a.lease = null;
      a.phase = "failed";
      a.blocker = "Planner lease expired. No automatic retry.";
      event(s, a.id, "expired", a.blocker, {}, now);
      changed = true;
    }
  return changed;
}
