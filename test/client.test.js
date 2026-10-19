import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invokeSupportedClient } from "../src/cli-client.js";
function fixture(t, result, inspect) {
  const dir = mkdtempSync(join(tmpdir(), "daymark-client-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const spawnImpl = (path, args, options) => {
    inspect?.(path, args, options);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = () =>
      queueMicrotask(() => {
        child.stdout.emit("data", JSON.stringify(result));
        child.emit("close", 0);
      });
    child.kill = () => {};
    return child;
  };
  return {
    directory: dir,
    spawnImpl,
    signal: new AbortController().signal,
    config: {
      clientPath: "supported-client",
      endpoint: "https://agentrouter.org",
      key: "private-test-key",
      model: "deepseek-v4-flash",
    },
    messages: [
      { content: "system contract" },
      { content: "untrusted document" },
    ],
  };
}
test("client requests low effort, bounded output/cost, no tools and no persistent session", async (t) => {
  const args = fixture(
    t,
    {
      subtype: "success",
      result: "{}",
      usage: { input_tokens: 12, output_tokens: 8 },
    },
    (path, a, o) => {
      assert.equal(path, "supported-client");
      for (const flag of [
        "--bare",
        "--no-session-persistence",
        "--strict-mcp-config",
        "--disable-slash-commands",
      ])
        assert.ok(a.includes(flag));
      assert.equal(a[a.indexOf("--tools") + 1], "");
      assert.equal(a[a.indexOf("--effort") + 1], "low");
      assert.equal(a[a.indexOf("--max-budget-usd") + 1], "0.20");
      assert.equal(o.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, "1536");
      assert.equal(o.env.ANTHROPIC_API_KEY, "private-test-key");
      assert.ok(!a.join(" ").includes("private-test-key"));
      assert.equal(o.windowsHide, true);
    },
  );
  const r = await invokeSupportedClient(args);
  assert.equal(r.usage.input_tokens, 12);
});
test("budget failure exposes numeric diagnostics without provider text or key", async (t) => {
  const args = fixture(t, {
    subtype: "error_max_budget_usd",
    is_error: true,
    result: "sensitive provider text",
    total_cost_usd: 0.11,
    usage: { input_tokens: 100, output_tokens: 20 },
  });
  await assert.rejects(
    invokeSupportedClient(args),
    (e) =>
      e.code === "client_request_failed" &&
      e.estimatedCostUsd === 0.11 &&
      e.inputTokens === 100 &&
      !e.message.includes("sensitive"),
  );
});
