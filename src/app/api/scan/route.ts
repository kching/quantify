import { listPortfolios } from '@/core/db';
import { scanPortfolio } from '@/core/market';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const rawId = new URL(request.url).searchParams.get('portfolioId');
  const portfolios = await listPortfolios();
  const portfolioId = rawId ? Number(rawId) : portfolios[0]?.id;
  if (!portfolioId || !portfolios.some((portfolio) => portfolio.id === portfolioId)) return Response.json({ error: 'Choose a portfolio to scan.' }, { status: 404 });
  try {
    const result = await scanPortfolio(portfolioId);
    return Response.json({ ...result, alerts: [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Market scan failed.' }, { status: 500 });
  }
}
