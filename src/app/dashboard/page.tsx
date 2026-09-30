import { redirect } from 'next/navigation';
import Dashboard from './dashboard';
import { getCurrentUser } from '@/lib/current-user';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  return <Dashboard user={user} />;
}
