import { redirect } from 'next/navigation';
import Preferences from '../preferences';
import { getUserPreferences } from '@/core/db';
import { getCurrentUser } from '@/lib/current-user';

export default async function TelegramPreferencesPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  const preferences = await getUserPreferences(user.id);
  return <Preferences user={user} initialPreferences={preferences} />;
}
