import { redirect } from 'next/navigation';
import Research from './research';
import { getCurrentUser } from '@/lib/current-user';
import { listPortfolios } from '@/core/db';

export default async function ResearchPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  const portfolios = await listPortfolios(user.id);
  return <Research user={user} hasPortfolio={portfolios.length > 0} />;
}
