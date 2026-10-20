import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inference, messages, configuration } from "../src/inference.js";
import { seed } from "../src/domain.js";
test("a billed but unusable model response retains numeric usage and is not retried", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "switchyard-usage-"));
  let calls = 0;
  const run = inference(dir, {
    config: { configured: true, model: "deepseek-v4-flash" },
    client: async () => {
      calls++;
      return {
        content: [{ type: "text", text: "not a JSON plan" }],
        usage: {
          input_tokens: 120,
          output_tokens: 40,
          cache_read_input_tokens: 64,
        },
        estimatedCostUsd: 0.006,
      };
    },
  });
  t.after(() => {
    run.close();
    rmSync(dir, { recursive: true, force: true });
  });
  await assert.rejects(
    run({ agent: "index", team: "harbour", records: seed().records }),
    (e) =>
      e.code === "invalid_output" &&
      e.inputTokens === 120 &&
      e.outputTokens === 40 &&
      e.cacheReadTokens === 64 &&
      e.estimatedCostUsd === 0.006,
  );
  assert.equal(calls, 1);
});
test("independent planners receive distinct scoped inputs and no alternate provider", () => {
  const records = seed().records;
  const a = messages({ agent: "index", team: "harbour", records }),
    b = messages({ agent: "caption", team: "harbour", records }),
    c = messages({ agent: "bulletin", team: "north", records });
  assert(!a[1].content.includes("brief"));
  assert(b[1].content.includes("brief"));
  assert(!b[1].content.includes("title"));
  assert(c[0].content.includes("north-web"));
  assert.throws(
    () => configuration({ AGENTROUTER_BASE_URL: "https://elsewhere.invalid" }),
    /approved/,
  );
});
