import { redirect } from 'next/navigation';
import Research from './research';
import { getCurrentUser } from '@/lib/current-user';
import { listHoldingStrategies, listPortfolios } from '@/core/db';

export default async function ResearchPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  const portfolios = await listPortfolios(user.id);
  const strategies = (await Promise.all(portfolios.map((portfolio) => listHoldingStrategies(portfolio.id, user.id)))).flat();
  return <Research user={user} portfolios={portfolios} initialStrategies={strategies} />;
}
