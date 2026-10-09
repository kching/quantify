import { listPortfolios } from "@/core/db";
import { refreshPortfolioSymbol } from "@/core/market";
import { publishMarketUpdate } from "@/core/market-update-events";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as {
    portfolioId?: unknown;
    symbol?: unknown;
  };
  const portfolioId = Number(body.portfolioId);
  const symbol =
    typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (
    !Number.isSafeInteger(portfolioId) ||
    portfolioId < 1 ||
    !/^[A-Z0-9.^-]{1,20}$/.test(symbol)
  ) {
    return Response.json(
      { error: "Enter a valid portfolio and ticker." },
      { status: 400 },
    );
  }
  if (
    !(await listPortfolios(user.id)).some(
      (portfolio) => portfolio.id === portfolioId,
    )
  ) {
    return Response.json({ error: "Portfolio not found." }, { status: 404 });
  }
  try {
    await refreshPortfolioSymbol(portfolioId, symbol);
    publishMarketUpdate({ completedAt: Date.now() });
    return Response.json({ ok: true });
  } catch (cause) {
    return Response.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : `Could not refresh ${symbol}.`,
      },
      { status: 502 },
    );
  }
}
