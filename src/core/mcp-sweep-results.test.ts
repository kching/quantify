import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanupExpiredMcpSweepResults,
  readMcpSweepResults,
  writeMcpSweepResults,
} from "./mcp-sweep-results";

const directory = mkdtempSync(join(tmpdir(), "quantify-sweep-results-test-"));
process.env.QUANTIFY_MCP_SWEEP_TMP_DIR = directory;

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
  delete process.env.QUANTIFY_MCP_SWEEP_TMP_DIR;
});

describe("temporary MCP sweep results", () => {
  it("keeps unexpired results and removes only expired files during cleanup", async () => {
    const runs = [
      {
        runIndex: 0,
        params: { period: 14 },
        metrics: { strategyReturnPct: 2 },
      },
    ];
    const expiresAt = await writeMcpSweepResults(101, runs);
    await writeFile(
      join(directory, "102.json"),
      JSON.stringify({ expiresAt: Date.now() - 1, runs }),
    );

    await cleanupExpiredMcpSweepResults();

    expect(existsSync(join(directory, "101.json"))).toBe(true);
    expect(existsSync(join(directory, "102.json"))).toBe(false);
    expect(await readMcpSweepResults(101, expiresAt)).toEqual(runs);
    expect(await readMcpSweepResults(101, Date.now() - 1)).toBeNull();
    expect(existsSync(join(directory, "101.json"))).toBe(false);
  });
});
