import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteD1 } from "../src/sqlite-d1.js";
import { api, SCHEMA } from "../src/control.js";
test("actual HTTP-shaped worker routes discover, claim, deliver and tick a committed operation", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "switch-worker-")),
    db = new SqliteD1(join(dir, "db.sqlite"));
  db.exec(SCHEMA);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let at = 100000;
  const env = { SWITCHYARD_WORKER_TOKEN: "service", NOW: () => at };
  async function call(path, data, headers = {}) {
    const req = new Request("http://127.0.0.1:3311/api" + path, {
      method: data ? "POST" : "GET",
      headers: {
        ...headers,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return api(req, db, env);
  }
  const initial = await call("/state"),
    cookie = initial.headers.get("set-cookie").split(";")[0],
    p = await initial.json(),
    auth = { Authorization: "Bearer service" };
  assert.equal((await call("/worker/ping", {}, auth)).status, 200);
  assert.equal(
    (
      await call(
        "/command",
        {
          op: "start",
          scenario: "normal",
          revision: 0,
          request: crypto.randomUUID(),
        },
        {
          cookie,
          origin: "http://127.0.0.1:3311",
          "x-switchyard-csrf": p.csrf,
        },
      )
    ).status,
    200,
  );
  const list = await (await call("/worker/work", {}, auth)).json();
  assert.equal(list.work.length, 3);
  const job = list.work.find((x) => x.agent === "index"),
    lease = crypto.randomUUID();
  const claimed = await (
    await call("/worker/claim", { ...job, lease }, auth)
  ).json();
  assert.equal(claimed.context.agent, "index");
  assert.equal(
    (
      await call(
        "/worker/result",
        {
          ...job,
          lease,
          result: {
            plan: {
              summary: "Title cleanup test double",
              steps: [{ recordId: "F1", title: "Tidelines" }],
            },
            usage: { input: 12, output: 6, estimatedUsd: 0.001 },
          },
        },
        auth,
      )
    ).status,
    200,
  );
  at += 7000;
  const tick = await (await call("/worker/tick", {}, auth)).json();
  assert.equal(tick.writes, 1);
  const final = await (await call("/state", null, { cookie })).json();
  assert.equal(final.state.records[0].title, "Tidelines");
  assert.equal(final.state.agents.index.phase, "done");
});
