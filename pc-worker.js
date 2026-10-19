import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { inference, configuration } from "./src/inference.js";
mkdirSync("data", { recursive: true });
if (!existsSync("data/worker-token"))
  writeFileSync("data/worker-token", randomBytes(32).toString("hex"), {
    mode: 0o600,
  });
const base = process.env.SWITCHYARD_SITE_URL || "http://127.0.0.1:3311",
  token = readFileSync("data/worker-token", "utf8").trim();
if (
  base !== "https://switchyard-control.choggyacc.chatgpt.site" &&
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)
)
  throw Error("Unapproved host.");
if (!configuration().configured)
  throw Error("The genuine AI client is not configured.");
const infer = inference("data/ai"),
  running = new Map();
let stop = false,
  connected = false;
async function call(path, data = {}) {
  const r = await fetch(base + "/api/worker/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  if (!r.ok)
    throw Object.assign(new Error("Service refused operation"), {
      status: r.status,
    });
  return r.json();
}
async function plan(job) {
  const lease = crypto.randomUUID();
  let context;
  try {
    ({ context } = await call("claim", { ...job, lease }));
  } catch {
    return;
  }
  if (!context) return;
  let result;
  try {
    result = await infer(context);
  } catch (e) {
    result = {
      error: [
        "allowance",
        "provider_timeout",
        "client_request_failed",
        "invalid_output",
        "plan",
        "scope",
        "record",
      ].includes(e.code)
        ? e.code
        : "provider_unavailable",
      usage: {
        input: e.inputTokens || 0,
        output: e.outputTokens || 0,
        estimatedUsd: e.estimatedCostUsd ?? null,
      },
    };
  }
  // Results are inert until the server rechecks the live epoch. A killed or paused
  // reading can still be charged; it must never regain execution authority.
  try {
    await call("result", { ...job, lease, result });
    console.log("Planner result delivered: " + job.agent);
  } catch {
    console.log("Planner result not committed; lease will expire.");
  }
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stop = true;
  });
console.log("Switchyard worker connecting.");
while (!stop) {
  try {
    await call("ping");
    await call("tick");
    if (!connected) {
      connected = true;
      console.log("Switchyard worker connected.");
    }
    const { work } = await call("work");
    for (const job of work) {
      const id = job.key + ":" + job.agent;
      if (running.size >= 3) break;
      if (running.has(id)) continue;
      const p = plan(job).finally(() => running.delete(id));
      running.set(id, p);
    }
  } catch {
    if (connected) {
      connected = false;
      console.log("Connection interrupted; reconnecting.");
    }
  }
  await new Promise((r) => setTimeout(r, 1000));
}
await Promise.allSettled([...running.values()]);
infer.close();
