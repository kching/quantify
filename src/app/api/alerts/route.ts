import { listAlerts } from "@/core/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const rawId = new URL(request.url).searchParams.get("portfolioId");
  const portfolioId = rawId ? Number(rawId) : undefined;
  if (
    portfolioId !== undefined &&
    (!Number.isSafeInteger(portfolioId) || portfolioId < 1)
  )
    return Response.json({ error: "Invalid portfolio." }, { status: 400 });
  return Response.json({ alerts: await listAlerts(portfolioId, user.id) });
}
