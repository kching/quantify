import { listPortfolios } from "@/core/db";
import { getCurrentUser } from "@/lib/current-user";
import { scanPortfolio } from "@/core/market";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const rawId = new URL(request.url).searchParams.get("portfolioId");
  const portfolios = await listPortfolios(user.id);
  const portfolioId = rawId ? Number(rawId) : portfolios[0]?.id;
  if (
    !portfolioId ||
    !portfolios.some((portfolio) => portfolio.id === portfolioId)
  )
    return Response.json(
      { error: "Choose a portfolio to scan." },
      { status: 404 },
    );
  try {
    const result = await scanPortfolio(portfolioId, user.id);
    return Response.json({ ...result, alerts: [] });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Market scan failed." },
      { status: 500 },
    );
  }
}
