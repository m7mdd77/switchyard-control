import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  seed,
  operator,
  claim,
  result,
  execute,
  expire,
  clone,
  validatePlan,
} from "../src/domain.js";
import { Control, SCHEMA, api } from "../src/control.js";
import { SqliteD1 } from "../src/sqlite-d1.js";
// These deterministic model doubles exercise authority and concurrency, not AI quality.
const plan = (id, team = "harbour") => ({
  summary: "A bounded test-double plan.",
  steps: ["F1", "F2", "F3"].map((recordId, i) =>
    id === "index"
      ? {
          recordId,
          title: ["Tidelines", "The Last Ferry", "A Light at Dawn"][i],
        }
      : id === "caption"
        ? { recordId, text: "A supplied fictional poster scene." }
        : { recordId, channel: team + "-web" },
  ),
});
function start(s, scenario = "normal", at = 100000) {
  operator(s, { op: "start", scenario }, at);
  return s;
}
function ready(s, id, at = 100001) {
  const lease = crypto.randomUUID();
  claim(s, id, lease, at);
  result(
    s,
    id,
    lease,
    {
      plan: plan(id, s.team),
      usage: { input: 100, output: 80, cache: 10, estimatedUsd: 0.001 },
    },
    at + 1,
  );
  return lease;
}
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "switchyard-")),
    db = new SqliteD1(join(dir, "test.sqlite"));
  db.exec(SCHEMA);
  let now = 100000;
  const c = new Control(db, () => now);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { db, c, setNow: (n) => (now = n), now: () => now };
}
test("three distinct agent plans change actual permitted records and publication waits for exact approval", async () => {
  const s = start(seed());
  ready(s, "index");
  ready(s, "caption");
  ready(s, "bulletin");
  await execute(s, "index", 110000);
  await execute(s, "caption", 110000);
  await execute(s, "bulletin", 110000);
  assert.equal(s.records[0].title, "Tidelines");
  assert.equal(s.records[0].published, false);
  const q = s.approvals[0];
  operator(s, { op: "approve", approval: q.id, digest: q.digest }, 110001);
  assert.equal(s.records[0].published, true);
  assert.equal(
    s.records[0].publication.caption,
    "A supplied fictional poster scene.",
  );
});
test("kill during inference discards a late real-shaped result and still records reported usage", async () => {
  const s = start(seed()),
    lease = crypto.randomUUID();
  claim(s, "caption", lease, 100001);
  operator(s, { op: "kill", agent: "caption" }, 100002);
  result(
    s,
    "caption",
    lease,
    {
      plan: plan("caption"),
      usage: { input: 100, output: 80, estimatedUsd: 0.002 },
    },
    100003,
  );
  assert.equal(s.agents.caption.mode, "killed");
  assert.equal(s.agents.caption.plan, null);
  assert.equal(s.agents.caption.usage.input, 100);
  assert.equal(s.agents.caption.trace[0].accepted, false);
  assert.equal(await execute(s, "caption", 200000), false);
  assert.equal(s.records[0].caption, "");
  assert.equal(s.events.at(-1).type, "discarded");
  assert.throws(
    () => operator(s, { op: "resume", agent: "caption" }),
    /paused/,
  );
});
test("pause between operations prevents writes; resume continues remaining work without another reading", async () => {
  const s = start(seed());
  ready(s, "index");
  await execute(s, "index", 110000);
  operator(s, { op: "pause", agent: "index" }, 110001);
  assert.equal(await execute(s, "index", 120000), false);
  assert.equal(s.agents.index.cursor, 1);
  operator(s, { op: "resume", agent: "index" }, 120001);
  await execute(s, "index", 130000);
  assert.equal(s.agents.index.cursor, 2);
  assert.equal(s.agents.index.attempts, 1);
});
test("pause during planning revokes the lease and resumed planning cannot use the old result", () => {
  const s = start(seed()),
    lease = crypto.randomUUID();
  claim(s, "index", lease, 100001);
  operator(s, { op: "pause", agent: "index" }, 100002);
  operator(s, { op: "resume", agent: "index" }, 100003);
  result(s, "index", lease, { plan: plan("index"), usage: {} }, 100004);
  assert.equal(s.agents.index.phase, "queued");
  assert.equal(s.agents.index.plan, null);
});
test("kill withdraws a queued approval and no stale approval can publish", async () => {
  const s = start(seed());
  ready(s, "bulletin");
  await execute(s, "bulletin", 110000);
  const q = clone(s.approvals[0]);
  operator(s, { op: "kill", agent: "bulletin" }, 110001);
  assert.equal(s.approvals[0].status, "withdrawn");
  assert.throws(
    () => operator(s, { op: "approve", approval: q.id, digest: q.digest }),
    /pending/,
  );
  assert.equal(s.records[0].published, false);
});
test("pause blocks approval; explicit resume restores that exact proposal only", async () => {
  const s = start(seed());
  ready(s, "bulletin");
  await execute(s, "bulletin", 110000);
  const q = clone(s.approvals[0]);
  operator(s, { op: "pause", agent: "bulletin" }, 110001);
  assert.throws(
    () =>
      operator(s, { op: "approve", approval: q.id, digest: q.digest }, 110002),
    /stopped/,
  );
  operator(s, { op: "resume", agent: "bulletin" }, 110003);
  operator(s, { op: "approve", approval: q.id, digest: q.digest }, 110004);
  assert.equal(s.records[0].published, true);
  assert.equal(s.records[1].published, false);
});
test("a changed payload digest, stale record or repeated approval cannot publish", async () => {
  const s = start(seed());
  ready(s, "bulletin");
  await execute(s, "bulletin", 110000);
  const q = clone(s.approvals[0]);
  assert.throws(
    () =>
      operator(s, { op: "approve", approval: q.id, digest: "wrong" }, 110001),
    /matches/,
  );
  s.records[0].version++;
  assert.throws(
    () =>
      operator(s, { op: "approve", approval: q.id, digest: q.digest }, 110002),
    /changed/,
  );
  operator(s, { op: "deny", approval: q.id, digest: q.digest }, 110003);
  assert.equal(s.records[0].published, false);
  assert.throws(
    () =>
      operator(s, { op: "approve", approval: q.id, digest: q.digest }, 110004),
    /pending/,
  );
});
test("publication freezes the approved snapshot instead of silently following later draft changes", async () => {
  const s = start(seed());
  ready(s, "bulletin");
  await execute(s, "bulletin", 110000);
  const q = s.approvals[0];
  operator(s, { op: "approve", approval: q.id, digest: q.digest }, 110001);
  const snapshot = clone(s.records[0].publication);
  ready(s, "index", 110002);
  await execute(s, "index", 120000);
  assert.deepEqual(s.records[0].publication, snapshot);
  assert.notEqual(s.records[0].title, snapshot.title);
});
test("rogue scope injection is labeled and quarantined before any publication", async () => {
  const s = start(seed(), "scope-escape");
  ready(s, "bulletin");
  const original = clone(s.agents.bulletin.plan);
  await execute(s, "bulletin", 110000);
  assert.equal(s.agents.bulletin.mode, "quarantined");
  assert.equal(
    s.records.some((r) => r.published),
    false,
  );
  assert.deepEqual(s.agents.bulletin.plan, original);
  assert.equal(s.events.at(-1).detail.injected, true);
  assert.equal(s.events.at(-1).detail.step.channel, "north-web");
});
test("out-of-scope fields and duplicate or unknown records cannot become operations", () => {
  assert.throws(
    () =>
      validatePlan(
        {
          summary: "x",
          steps: [{ recordId: "F1", title: "Hello", channel: "north-web" }],
        },
        "index",
        seed().records,
      ),
    /scope/,
  );
  assert.throws(
    () =>
      validatePlan(
        {
          summary: "x",
          steps: [
            { recordId: "F1", title: "Hello" },
            { recordId: "F1", title: "Hello" },
          ],
        },
        "index",
        seed().records,
      ),
    /duplicate/,
  );
  assert.throws(
    () =>
      validatePlan(
        { summary: "x", steps: [{ recordId: "F9", title: "Hello" }] },
        "index",
        seed().records,
      ),
    /Unknown/,
  );
});
test("expired planner is failed without retry and a late result is inert", () => {
  const s = start(seed()),
    lease = crypto.randomUUID();
  claim(s, "caption", lease, 100001);
  assert.equal(expire(s, 170000), true);
  result(s, "caption", lease, { plan: plan("caption"), usage: {} }, 170001);
  assert.equal(s.agents.caption.phase, "failed");
  assert.equal(s.records[0].caption, "");
  assert.equal(s.agents.caption.attempts, 1);
});
test("failed reading is visible and never replaced with fixture work", () => {
  const s = start(seed()),
    lease = crypto.randomUUID();
  claim(s, "index", lease, 100001);
  result(
    s,
    "index",
    lease,
    { error: "provider_timeout", usage: { estimatedUsd: null } },
    100002,
  );
  assert.equal(s.agents.index.phase, "failed");
  assert.equal(s.agents.index.plan, null);
  assert.equal(s.agents.index.usage.unknownCosts, 1);
});
test("operator request idempotency and optimistic revisions prevent repeated dispatch", async (t) => {
  const { c } = setup(t);
  const row = await c.ensure(crypto.randomUUID(), "harbour"),
    cmd = {
      op: "start",
      scenario: "normal",
      revision: 0,
      request: crypto.randomUUID(),
    };
  const first = await c.command(row.id, cmd),
    second = await c.command(row.id, cmd);
  assert.equal(first.run, 1);
  assert.equal(second.run, 1);
  assert.equal(second.revision, 1);
  await assert.rejects(
    c.command(row.id, { ...cmd, request: crypto.randomUUID() }),
    /changed/,
  );
});
test("concurrent start requests admit exactly one operator revision", async (t) => {
  const { c } = setup(t),
    row = await c.ensure(crypto.randomUUID(), "harbour");
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      c.command(row.id, {
        op: "start",
        scenario: "normal",
        revision: 0,
        request: crypto.randomUUID(),
      }),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(JSON.parse((await c.load(row.id)).state).run, 1);
});
test("different visitors and teams have isolated authoritative records", async (t) => {
  const { c } = setup(t),
    owner = crypto.randomUUID(),
    one = await c.ensure(owner, "harbour"),
    two = await c.ensure(owner, "north"),
    other = await c.ensure(crypto.randomUUID(), "harbour");
  await c.command(one.id, {
    op: "start",
    scenario: "scope-escape",
    revision: 0,
    request: crypto.randomUUID(),
  });
  assert.equal(JSON.parse((await c.load(two.id)).state).run, 0);
  assert.equal(JSON.parse((await c.load(other.id)).state).run, 0);
});
test("global planner allowance is atomic and queued overage becomes a visible failure", async (t) => {
  const { c, db } = setup(t);
  for (let i = 0; i < 29; i++)
    await db
      .prepare("INSERT INTO attempts(id,at) VALUES(?,?)")
      .bind(crypto.randomUUID(), 100000)
      .run();
  const rows = await Promise.all([
    c.ensure(crypto.randomUUID(), "harbour"),
    c.ensure(crypto.randomUUID(), "harbour"),
  ]);
  for (const row of rows)
    await c.command(row.id, {
      op: "start",
      scenario: "normal",
      revision: 0,
      request: crypto.randomUUID(),
    });
  const values = await Promise.all(
    rows.map((row) => c.claim(row.id, "index", crypto.randomUUID())),
  );
  assert.equal(values.filter((x) => x.context).length, 1);
  assert.equal(
    values.filter((x) => x.state.agents.index.phase === "failed").length,
    1,
  );
});
function request(path, body, headers = {}) {
  return new Request("http://127.0.0.1:3311/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test("public sessions are HttpOnly, export is an actual attachment, and service token never leaks", async (t) => {
  const { db, now } = setup(t),
    env = { SWITCHYARD_WORKER_TOKEN: "private-service-token", NOW: now };
  const r = await api(request("/state"), db, env);
  assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  const cookie = r.headers.get("set-cookie").split(";")[0],
    text = await r.text();
  assert(!text.includes("private-service-token"));
  const exp = await api(request("/export", null, { cookie }), db, env);
  assert.match(exp.headers.get("content-disposition"), /attachment/);
  assert.equal((await exp.json()).team, "harbour");
});
test("cross-origin, missing CSRF, state injection and unauthenticated service calls are refused", async (t) => {
  const { db, now } = setup(t),
    env = { SWITCHYARD_WORKER_TOKEN: "private-service-token", NOW: now },
    r = await api(request("/state"), db, env),
    p = await r.json(),
    cookie = r.headers.get("set-cookie").split(";")[0];
  const c = {
    op: "start",
    scenario: "normal",
    revision: 0,
    request: crypto.randomUUID(),
  };
  assert.equal(
    (
      await api(
        request("/command", c, {
          cookie,
          origin: "https://elsewhere.invalid",
          "x-switchyard-csrf": p.csrf,
        }),
        db,
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        request("/command", c, { cookie, origin: "http://127.0.0.1:3311" }),
        db,
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        request(
          "/command",
          { ...c, state: {} },
          {
            cookie,
            origin: "http://127.0.0.1:3311",
            "x-switchyard-csrf": p.csrf,
          },
        ),
        db,
        env,
      )
    ).status,
    400,
  );
  assert.equal((await api(request("/worker/work", {}), db, env)).status, 401);
});
