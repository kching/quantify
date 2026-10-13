import { authenticateMcpToken, getMcpSweep, listMcpSweepRuns } from "@/core/db";
import { wakeMcpSweepJobs } from "@/core/mcp-sweep-jobs";
import {
  MCP_SWEEP_RESULT_TTL_MS,
  readMcpSweepResults,
} from "@/core/mcp-sweep-results";
import { hashMcpSecret } from "@/lib/mcp-tokens";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (qcp_[a-f0-9]{64})$/i.exec(authorization);
  if (!match)
    return Response.json({ error: "Bearer token required." }, { status: 401 });
  const identity = await authenticateMcpToken(await hashMcpSecret(match[1]!));
  if (!identity)
    return Response.json(
      { error: "Invalid or expired token." },
      { status: 401 },
    );

  const sweepId = Number((await context.params).id);
  const query = new URL(request.url).searchParams;
  const offset = query.has("offset") ? Number(query.get("offset")) : 0;
  const limit = query.has("limit") ? Number(query.get("limit")) : 10;
  if (
    !Number.isSafeInteger(sweepId) ||
    sweepId < 1 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 200
  )
    return Response.json({ error: "Invalid sweep page." }, { status: 400 });

  await wakeMcpSweepJobs();
  const sweep = await getMcpSweep(identity.userId, sweepId);
  if (!sweep)
    return Response.json({ error: "Sweep not found." }, { status: 404 });
  if (sweep.status !== "completed")
    return Response.json(
      { error: "Sweep results are not ready.", sweep },
      { status: 409 },
    );
  const expiresAt =
    sweep.resultsExpiresAt ??
    (sweep.finishedAt ?? sweep.createdAt) + MCP_SWEEP_RESULT_TTL_MS;
  if (Date.now() >= expiresAt)
    return Response.json(
      { error: "Sweep results expired or are unavailable after one hour." },
      { status: 404 },
    );
  let runs;
  if (sweep.resultsExpiresAt !== null) {
    const storedRuns = await readMcpSweepResults(sweepId, expiresAt);
    if (!storedRuns)
      return Response.json(
        { error: "Sweep results expired or are unavailable after one hour." },
        { status: 404 },
      );
    runs = storedRuns
      .slice(offset, offset + limit)
      .map((run) => ({ ...run, sweepId }));
  } else {
    runs = await listMcpSweepRuns(identity.userId, sweepId, offset, limit);
  }
  return Response.json({ sweep, offset, limit, runs });
}
