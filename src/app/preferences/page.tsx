import { redirect } from 'next/navigation';

export default function PreferencesPage(): never {
  redirect('/preferences/telegram');
}
