import {
  createMcpAccessToken,
  listMcpAccessTokens,
  revokeMcpAccessToken,
} from "@/core/db";
import { getCurrentUser } from "@/lib/current-user";
import {
  createMcpSecret,
  hashMcpSecret,
  MCP_TOKEN_LIFETIME_MS,
} from "@/lib/mcp-tokens";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  return Response.json({ tokens: await listMcpAccessTokens(user.id) });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (
    !input ||
    typeof input !== "object" ||
    typeof (input as { label?: unknown }).label !== "string"
  )
    return Response.json({ error: "Provide a token label." }, { status: 400 });
  const label = (input as { label: string }).label.trim();
  if (!label || label.length > 100)
    return Response.json(
      { error: "Token label must be 1 to 100 characters." },
      { status: 400 },
    );
  const token = createMcpSecret();
  const expiresAt = Date.now() + MCP_TOKEN_LIFETIME_MS;
  const record = await createMcpAccessToken({
    userId: user.id,
    label,
    tokenHash: await hashMcpSecret(token),
    expiresAt,
  });
  const safeRecord = {
    id: record.id,
    userId: record.userId,
    label: record.label,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  };
  return Response.json({ token, record: safeRecord }, { status: 201 });
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: "Invalid token ID." }, { status: 400 });
  return (await revokeMcpAccessToken(user.id, id))
    ? Response.json({ success: true })
    : Response.json({ error: "Active token not found." }, { status: 404 });
}
