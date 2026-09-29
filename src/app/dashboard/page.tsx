import { redirect } from 'next/navigation';
import Dashboard from './dashboard';
import { auth } from '@/lib/auth';
import { getCurrentUser } from '@/lib/current-user';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  if (!(await auth())) redirect('/');
  const user = await getCurrentUser();
  if (!user) redirect('/');
  return <Dashboard user={user} />;
}
