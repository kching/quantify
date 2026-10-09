import { addHolding, ownsPortfolio, removeHolding } from "@/core/db";
import { fetchYahooCandles } from "@/core/providers/yahoo.provider";
import { getCurrentUser } from "@/lib/current-user";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: rawId } = await context.params;
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(rawId);
  const body = (await request.json()) as { symbol?: unknown };
  const symbolInput =
    typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const symbol = symbolInput;
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !/^[A-Z0-9.^-]{1,20}$/.test(symbol)
  )
    return Response.json(
      { error: "Enter a valid ticker, such as QQQ or MQG.AX." },
      { status: 400 },
    );
  if (!(await ownsPortfolio(id, user.id)))
    return Response.json({ error: "Portfolio not found." }, { status: 404 });
  try {
    const candles = await fetchYahooCandles(symbol, "1d", 365);
    if (!candles.length)
      return Response.json({ error: "Ticker not found." }, { status: 404 });
    await addHolding(id, symbol, user.id);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("No Yahoo Finance data") ||
      message.includes("Yahoo Finance returned 404")
    )
      return Response.json({ error: "Ticker not found." }, { status: 404 });
    return Response.json(
      { error: "Unable to validate ticker." },
      { status: 502 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: rawId } = await context.params;
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(rawId);
  const symbol =
    new URL(request.url).searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !/^[A-Z0-9.^-]{1,20}$/.test(symbol)
  )
    return Response.json(
      { error: "Invalid portfolio or ticker." },
      { status: 400 },
    );
  try {
    await removeHolding(id, symbol, user.id);
  } catch {
    return Response.json({ error: "Portfolio not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
