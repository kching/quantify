'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, MessageCircle, Save } from 'lucide-react';
import type { JsonValue, UserPreferences, UserProfile } from '@/core/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import '@/components/AppSidebar/AppSidebar.css';
import './preferences.css';

interface TelegramPreferences { botToken: string; chatId: string; }
interface PreferencesProps { user: Pick<UserProfile, 'name' | 'image'>; initialPreferences: UserPreferences; }

function readTelegram(preferences: UserPreferences): TelegramPreferences {
  const telegram = preferences.telegram;
  if (!telegram || typeof telegram !== 'object' || Array.isArray(telegram)) return { botToken: '', chatId: '' };
  const values = telegram as Record<string, JsonValue>;
  return { botToken: typeof values.botToken === 'string' ? values.botToken : '', chatId: typeof values.chatId === 'string' ? values.chatId : '' };
}

export default function Preferences({ user, initialPreferences }: PreferencesProps): React.JSX.Element {
  const [telegram, setTelegram] = useState<TelegramPreferences>(() => readTelegram(initialPreferences));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const firstName = user.name.trim().split(/\s+/)[0] || 'User';

  async function saveTelegram(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { telegram } }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to save Telegram settings.');
      setMessage({ text: 'Telegram settings saved.', error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Unable to save Telegram settings.', error: true });
    } finally {
      setSaving(false);
    }
  }

  return <div className="app-shell preferences-shell" id="top">
    <Sidebar className="preferences-sidebar">
      <SidebarHeader><Link className="sidebar-brand preferences-brand" href="/dashboard"><span className="sidebar-logo">Q</span><span className="sidebar-brand-copy">quantify<span>.</span></span></Link></SidebarHeader>
      <SidebarContent>
        <div className="preferences-sidebar-heading">PREFERENCES</div>
        <SidebarGroup><SidebarMenu aria-label="Preference pages">
          <SidebarMenuItem><SidebarMenuButton href="/preferences/telegram" isActive ariaLabel="Telegram" title="Telegram"><MessageCircle/><span className="sidebar-menu-label">Telegram</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></SidebarGroup>
      </SidebarContent>
      <SidebarFooter><div className="preferences-user"><span className="profile-avatar" aria-hidden="true" style={user.image ? { backgroundImage: `url(${user.image})` } : undefined}>{user.image ? null : firstName.charAt(0).toUpperCase()}</span><span><strong>{firstName}</strong><small>Preferences</small></span></div></SidebarFooter>
    </Sidebar>
    <main className="app-main preferences-main">
      <div className="preferences-content">
        <div className="preferences-back"><Link href="/dashboard"><ArrowLeft/>Back to workspace</Link></div>
        <header className="page-heading"><div><p className="section-kicker">PREFERENCES · INTEGRATIONS</p><h1>Telegram</h1><p className="page-subtitle">Connect a Telegram bot to receive messages from Quantify.</p></div></header>
        <Card className="telegram-preferences-card"><CardHeader className="section-card-header"><div><p className="section-kicker">TELEGRAM ACCOUNT</p><CardTitle>Bot connection</CardTitle><CardDescription>Enter a bot token and the chat ID where messages should be sent.</CardDescription></div></CardHeader>
          <CardContent><form className="telegram-preferences-form" onSubmit={(event) => void saveTelegram(event)}>
            <label>Bot token<Input aria-label="Telegram bot token" type="password" autoComplete="new-password" value={telegram.botToken} onChange={(event) => setTelegram((current) => ({ ...current, botToken: event.target.value }))} placeholder="123456:ABC…"/></label>
            <p className="telegram-field-help">Create a bot with BotFather in Telegram, then paste its token here.</p>
            <label>Chat ID<Input aria-label="Telegram chat ID" value={telegram.chatId} onChange={(event) => setTelegram((current) => ({ ...current, chatId: event.target.value }))} placeholder="Your personal or group chat ID"/></label>
            <p className="telegram-field-help">Start a conversation with your bot and provide the chat ID it should message.</p>
            <div className="telegram-form-actions"><Button type="submit" disabled={saving}>{saving ? null : <Save className="size-4"/>}{saving ? 'Saving…' : 'Save Telegram settings'}</Button>{message && <span className={message.error ? 'preferences-message error' : 'preferences-message'} role={message.error ? 'alert' : 'status'}>{!message.error && <Check/>}{message.text}</span>}</div>
          </form></CardContent>
        </Card>
      </div>
    </main>
  </div>;
}
