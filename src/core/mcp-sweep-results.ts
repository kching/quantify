import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { McpSweepRun } from "./types";

export const MCP_SWEEP_RESULT_TTL_MS = 60 * 60 * 1000;
function resultDirectory(): string {
  return (
    process.env.QUANTIFY_MCP_SWEEP_TMP_DIR ??
    join(
      dirname(
        process.env.QUANTIFY_DB_PATH ??
          join(process.cwd(), "data", "quantify.sqlite"),
      ),
      "tmp",
      "mcp-sweep-results",
    )
  );
}

function resultPath(sweepId: number): string {
  return join(resultDirectory(), `${sweepId}.json`);
}

export async function writeMcpSweepResults(
  sweepId: number,
  runs: readonly Omit<McpSweepRun, "sweepId">[],
): Promise<number> {
  await mkdir(resultDirectory(), { recursive: true });
  const expiresAt = Date.now() + MCP_SWEEP_RESULT_TTL_MS;
  const temporaryPath = join(
    resultDirectory(),
    `${sweepId}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, JSON.stringify({ expiresAt, runs }), {
      mode: 0o600,
    });
    await rename(temporaryPath, resultPath(sweepId));
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return expiresAt;
}

export async function readMcpSweepResults(
  sweepId: number,
  expiresAt: number,
): Promise<Array<Omit<McpSweepRun, "sweepId">> | null> {
  if (Date.now() >= expiresAt) {
    await unlink(resultPath(sweepId)).catch(() => undefined);
    return null;
  }
  try {
    const data = JSON.parse(await readFile(resultPath(sweepId), "utf8")) as {
      expiresAt: number;
      runs: Array<Omit<McpSweepRun, "sweepId">>;
    };
    if (Date.now() >= data.expiresAt) {
      await unlink(resultPath(sweepId)).catch(() => undefined);
      return null;
    }
    return data.runs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function cleanupExpiredMcpSweepResults(): Promise<void> {
  let names: string[];
  try {
    names = await readdir(/* turbopackIgnore: true */ resultDirectory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await Promise.all(
    names.map(async (name) => {
      if (!/^\d+\.json$/.test(name) && !/^\d+-[\w-]+\.tmp$/.test(name)) return;
      const path = join(resultDirectory(), name);
      try {
        if (name.endsWith(".tmp")) {
          const info = await stat(path);
          if (Date.now() >= info.mtimeMs + MCP_SWEEP_RESULT_TTL_MS)
            await unlink(path);
          return;
        }
        const result = JSON.parse(await readFile(path, "utf8")) as {
          expiresAt: number;
        };
        if (Number.isFinite(result.expiresAt) && Date.now() >= result.expiresAt)
          await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }),
  );
}
