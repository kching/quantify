import { getCurrentUser } from "@/lib/current-user";
import { subscribeBacktestEvents } from "@/lib/backtest-events";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!(await getCurrentUser()))
    return Response.json({ error: "Sign in required." }, { status: 401 });

  const batchId = new URL(request.url).searchParams.get("batchId") ?? "";
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(batchId))
    return Response.json(
      { error: "A valid batch id is required." },
      { status: 400 },
    );

  return new Response(subscribeBacktestEvents(batchId), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
