import {
  seed,
  rule,
  clone,
  operator,
  claim,
  result,
  execute,
  expire,
  publicState,
  event,
  AGENTS,
  TEAMS,
} from "./domain.js";
export const SCHEMA = `CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,csrf TEXT NOT NULL,touched INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,owner TEXT NOT NULL,team TEXT NOT NULL,rev INTEGER NOT NULL,state TEXT NOT NULL,touched INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ws_touched ON workspaces(touched);
CREATE TABLE IF NOT EXISTS service(id INTEGER PRIMARY KEY,at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_at ON attempts(at);`;
export class Control {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  async load(key) {
    return this.db
      .prepare("SELECT * FROM workspaces WHERE id=?")
      .bind(key)
      .first();
  }
  async ensure(owner, team) {
    rule(TEAMS.includes(team), "team", "Unknown team.");
    const key = owner + "_" + team;
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO workspaces(id,owner,team,rev,state,touched) VALUES(?,?,?,0,?,?)",
      )
      .bind(key, owner, team, JSON.stringify(seed(team)), this.now())
      .run();
    return this.load(key);
  }
  async mutate(key, fn, { expected, request } = {}) {
    for (let n = 0; n < 4; n++) {
      const row = await this.load(key);
      rule(row, "workspace", "Unknown workspace.");
      const state = JSON.parse(row.state);
      if (request && state.requests.includes(request)) return state;
      if (expected !== undefined)
        rule(
          expected === row.rev,
          "stale",
          "The fleet changed. Review the current state and try again.",
        );
      const changed = await fn(state);
      if (changed === false) return state;
      state.revision = row.rev + 1;
      if (request) {
        state.requests.push(request);
        if (state.requests.length > 150) state.requests.shift();
      }
      const r = await this.db
        .prepare(
          "UPDATE workspaces SET state=?,rev=?,touched=? WHERE id=? AND rev=?",
        )
        .bind(JSON.stringify(state), state.revision, this.now(), key, row.rev)
        .run();
      if (r.meta.changes === 1) return state;
    }
    throw Object.assign(new Error("Concurrent update. Refresh the fleet."), {
      code: "stale",
    });
  }
  async connected() {
    const row = await this.db
      .prepare("SELECT at FROM service WHERE id=1")
      .first();
    return Boolean(row && row.at > this.now() - 16000);
  }
  async command(key, c) {
    rule(
      typeof c.request === "string" && /^[a-f0-9-]{36}$/.test(c.request),
      "request",
      "A request identity is required.",
    );
    rule(
      Number.isSafeInteger(c.revision),
      "stale",
      "A current revision is required.",
    );
    return this.mutate(key, (s) => operator(s, c, this.now()), {
      expected: c.revision,
      request: c.request,
    });
  }
  async work() {
    const rows = await this.db
      .prepare("SELECT id,state FROM workspaces ORDER BY touched DESC LIMIT 80")
      .all();
    return rows.results
      .flatMap((row) => {
        const s = JSON.parse(row.state);
        return AGENTS.filter(
          (id) =>
            s.agents[id].mode === "active" && s.agents[id].phase === "queued",
        ).map((agent) => ({ key: row.id, agent }));
      })
      .slice(0, 12);
  }
  async claim(key, id, lease) {
    rule(/^[a-f0-9-]{36}$/.test(lease), "lease", "Invalid lease.");
    let context,
      admitted = false;
    const state = await this.mutate(key, async (s) => {
      const a = s.agents[id];
      rule(
        a?.mode === "active" && a.phase === "queued",
        "unavailable",
        "Planner no longer queued.",
      );
      if (!admitted) {
        const admission = await this.db
          .prepare(
            "INSERT OR IGNORE INTO attempts(id,at) SELECT ?,? WHERE (SELECT COUNT(*) FROM attempts WHERE at>?)<30",
          )
          .bind(lease, this.now(), this.now() - 3600000)
          .run();
        if (admission.meta.changes !== 1) {
          a.phase = "failed";
          a.blocker = "Shared AI allowance reached. No reading started.";
          event(s, id, "allowance", a.blocker, {}, this.now());
          return;
        }
        admitted = true;
      }
      context = claim(s, id, lease, this.now());
    });
    return { context, state: publicState(state) };
  }
  async result(key, id, lease, payload) {
    return this.mutate(key, (s) => result(s, id, lease, payload, this.now()));
  }
  async tick() {
    const rows = await this.db
      .prepare("SELECT id,state FROM workspaces ORDER BY touched DESC LIMIT 80")
      .all();
    let writes = 0;
    for (const row of rows.results) {
      const peek = JSON.parse(row.state);
      if (
        !Object.values(peek.agents).some(
          (a) =>
            a.mode === "active" &&
            ((a.phase === "ready" && a.nextAt <= this.now()) ||
              (a.phase === "planning" && a.lease?.expires < this.now())),
        )
      )
        continue;
      await this.mutate(row.id, async (s) => {
        let changed = expire(s, this.now());
        for (const id of AGENTS)
          changed = (await execute(s, id, this.now())) || changed;
        return changed;
      });
      writes++;
    }
    return writes;
  }
}
function response(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export async function api(req, db, env = {}) {
  const url = new URL(req.url),
    path = url.pathname.replace(/^\/api/, "");
  const control = new Control(db, env.NOW || Date.now);
  try {
    if (path.startsWith("/worker/")) {
      rule(
        env.SWITCHYARD_WORKER_TOKEN &&
          req.headers.get("authorization") ===
            "Bearer " + env.SWITCHYARD_WORKER_TOKEN,
        "unauthorized",
        "Service access required.",
      );
      rule(req.method === "POST", "method", "Use POST.");
      const body = await bodyOf(req);
      if (path === "/worker/ping") {
        await db
          .prepare(
            "INSERT INTO service(id,at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at",
          )
          .bind(control.now())
          .run();
        return response({ connected: true });
      }
      if (path === "/worker/work")
        return response({ work: await control.work() });
      if (path === "/worker/tick")
        return response({ writes: await control.tick() });
      rule(
        typeof body.key === "string" &&
          /^[a-f0-9-]{36}_(harbour|north)$/.test(body.key),
        "workspace",
        "Invalid workspace.",
      );
      rule(AGENTS.includes(body.agent), "agent", "Unknown agent.");
      if (path === "/worker/claim")
        return response(await control.claim(body.key, body.agent, body.lease));
      if (path === "/worker/result") {
        rule(
          body.result && JSON.stringify(body.result).length <= 10000,
          "result",
          "Invalid result.",
        );
        return response({
          state: publicState(
            await control.result(body.key, body.agent, body.lease, body.result),
          ),
        });
      }
      throw Object.assign(new Error("Unknown operation."), { code: "path" });
    }
    rule(["GET", "POST"].includes(req.method), "method", "Method not allowed.");
    const cookie = req.headers.get("cookie") || "",
      match = cookie.match(/(?:^|;\s*)switch_session=([a-f0-9-]{36})(?:;|$)/);
    let owner = match?.[1],
      session = owner
        ? await db
            .prepare("SELECT * FROM sessions WHERE id=?")
            .bind(owner)
            .first()
        : null;
    const headers = {};
    if (!session) {
      rule(
        req.method === "GET",
        "session",
        "Reload the page before sending commands.",
      );
      owner = crypto.randomUUID();
      session = { id: owner, csrf: crypto.randomUUID() };
      await db
        .prepare("INSERT INTO sessions(id,csrf,touched) VALUES(?,?,?)")
        .bind(owner, session.csrf, control.now())
        .run();
      headers["Set-Cookie"] =
        "switch_session=" +
        owner +
        "; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800" +
        (url.protocol === "https:" ? "; Secure" : "");
    }
    const team = url.searchParams.get("team") || "harbour";
    rule(TEAMS.includes(team), "team", "Unknown team.");
    const row = await control.ensure(owner, team);
    if (req.method === "GET") {
      rule(["/state", "/export"].includes(path), "path", "Unknown endpoint.");
      const state = publicState(JSON.parse(row.state));
      if (path === "/export")
        return response(
          {
            format: "switchyard-daybook-v1",
            exportedAt: control.now(),
            ...state,
          },
          200,
          {
            ...headers,
            "Content-Disposition":
              'attachment; filename="switchyard-' + team + '.json"',
          },
        );
      const after = Number(url.searchParams.get("after") || 0);
      return response(
        {
          state,
          csrf: session.csrf,
          connected: await control.connected(),
          stream: state.events.filter((e) => e.seq > after),
        },
        200,
        headers,
      );
    }
    rule(path === "/command", "path", "Unknown endpoint.");
    rule(
      req.headers.get("origin") === url.origin,
      "origin",
      "Same-origin access required.",
    );
    rule(
      req.headers.get("x-switchyard-csrf") === session.csrf,
      "csrf",
      "Reload before sending commands.",
    );
    const c = await bodyOf(req);
    rule(
      Object.keys(c).every((k) =>
        [
          "op",
          "agent",
          "approval",
          "digest",
          "scenario",
          "revision",
          "request",
        ].includes(k),
      ),
      "command",
      "Unknown command fields.",
    );
    if (c.op === "start")
      rule(
        await control.connected(),
        "offline",
        "The live fleet service is offline.",
      );
    const state = publicState(await control.command(row.id, c));
    return response(
      { state, csrf: session.csrf, connected: await control.connected() },
      200,
      headers,
    );
  } catch (e) {
    const statuses = {
      unauthorized: 401,
      origin: 403,
      csrf: 403,
      session: 403,
      stale: 409,
      allowance: 429,
      limit: 429,
      offline: 503,
    };
    return response(
      {
        error: e.code || "unavailable",
        message: e.code
          ? e.message
          : "The request could not finish. Existing work is preserved.",
      },
      statuses[e.code] || 400,
    );
  }
}
async function bodyOf(req) {
  rule(
    req.headers.get("content-type")?.startsWith("application/json"),
    "body",
    "JSON required.",
  );
  const text = await req.text();
  rule(text.length <= 16000, "body", "Request too large.");
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    rule(false, "body", "Invalid JSON.");
  }
  rule(
    b && typeof b === "object" && !Array.isArray(b),
    "body",
    "Object required.",
  );
  return b;
}
