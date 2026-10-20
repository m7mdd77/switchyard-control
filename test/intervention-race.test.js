import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Control, SCHEMA } from "../src/control.js";
import { SqliteD1 } from "../src/sqlite-d1.js";
import { seed, operator, claim, result } from "../src/domain.js";
test("unrelated fleet progress cannot veto a targeted kill, but a new epoch cannot be stopped by an old control", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "switch-race-")),
    db = new SqliteD1(join(dir, "db.sqlite"));
  db.exec(SCHEMA);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = new Control(db, () => 100000),
    row = await c.ensure(crypto.randomUUID(), "harbour");
  const s = await c.command(row.id, {
    op: "start",
    scenario: "normal",
    revision: 0,
    request: crypto.randomUUID(),
  });
  await c.claim(row.id, "index", crypto.randomUUID());
  await c.claim(row.id, "bulletin", crypto.randomUUID());
  const cmd = {
    op: "kill",
    agent: "caption",
    run: s.run,
    epoch: s.agents.caption.epoch,
    revision: s.revision,
    request: crypto.randomUUID(),
  };
  const stopped = await c.command(row.id, cmd);
  assert.equal(stopped.agents.caption.mode, "killed");
  await assert.rejects(
    c.command(row.id, { ...cmd, request: crypto.randomUUID() }),
    /authority changed/,
  );
  assert.equal(stopped.agents.index.phase, "planning");
});
test("a fresh run preserves earlier per-reading usage summaries", () => {
  const s = seed();
  operator(s, { op: "start", scenario: "normal" }, 100000);
  const lease = crypto.randomUUID();
  claim(s, "index", lease, 100001);
  result(
    s,
    "index",
    lease,
    {
      error: "provider_timeout",
      usage: { input: 20, output: 10, estimatedUsd: 0.001 },
    },
    100002,
  );
  operator(s, { op: "kill", agent: "caption" }, 100003);
  operator(s, { op: "kill", agent: "bulletin" }, 100004);
  operator(s, { op: "start", scenario: "normal" }, 120000);
  assert.equal(s.agents.index.trace.length, 1);
  assert.equal(s.agents.index.trace[0].run, 1);
  assert.equal(s.agents.index.usage.input, 20);
});
