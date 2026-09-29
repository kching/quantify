'use client';

import { useState, useSyncExternalStore } from 'react';
import { Activity, BarChart3, CircleHelp, LayoutDashboard, Wallet, Microscope } from 'lucide-react';
import { signOut } from 'next-auth/react';
import type { UserProfile } from '@/core/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

type AppPage = 'dashboard' | 'research';

const sections = new Set(['overview', 'portfolio', 'performance', 'ledger']);

function getActiveSection(): string {
  const hash = window.location.hash.slice(1);
  return sections.has(hash) ? hash : 'overview';
}

function subscribeToLocation(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export default function AppSidebar({ page, user }: { page: AppPage; user?: Pick<UserProfile, 'name' | 'image'> }): React.JSX.Element {
  const section = useSyncExternalStore(subscribeToLocation, getActiveSection, () => 'overview');
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dashboardActive = page === 'dashboard';
  const displayName = user?.name ?? 'Admin';
  const firstName = displayName.trim().split(/\s+/)[0] || 'User';
  const avatarLabel = firstName.slice(0, 1).toUpperCase();

  return <Sidebar data-collapsed={collapsed}>
    <SidebarHeader>
      <button className="sidebar-brand" type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
        <span className="sidebar-logo">Q</span>
        <span className="sidebar-brand-copy">quantify<span>.</span></span>
      </button>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton href="/#overview" title="Overview" ariaLabel="Overview" isActive={dashboardActive && section === 'overview'}><LayoutDashboard/><span className="sidebar-menu-label">Overview</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton href="/#portfolio" title="Portfolio signals" ariaLabel="Portfolio signals" isActive={dashboardActive && section === 'portfolio'}><Activity/><span className="sidebar-menu-label">Portfolio signals</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton href="/#performance" title="P&L performance" ariaLabel="P&L performance" isActive={dashboardActive && section === 'performance'}><BarChart3/><span className="sidebar-menu-label">P&amp;L performance</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton href="/#ledger" title="Trade & cash ledger" ariaLabel="Trade & cash ledger" isActive={dashboardActive && section === 'ledger'}><Wallet/><span className="sidebar-menu-label">Trade &amp; cash ledger</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton href="/research" title="Strategy research" ariaLabel="Strategy research" isActive={page === 'research'}><Microscope/><span className="sidebar-menu-label">Strategy research</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <div className="sidebar-help"><CircleHelp/><span>Decision support only<br/><small>No orders are sent</small></span></div>
      <div className="sidebar-profile-wrap">
        <button className="sidebar-profile" type="button" aria-label="Open account menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}>
          <span className="profile-avatar" aria-hidden="true" style={user?.image ? { backgroundImage: `url(${user.image})` } : undefined}>{user?.image ? null : avatarLabel}</span>
          <span className="sidebar-profile-copy"><strong>{firstName}</strong></span>
        </button>
        {profileOpen && <div className="profile-menu" role="menu"><button type="button" role="menuitem" onClick={() => void signOut({ callbackUrl: '/' })}>Sign out</button></div>}
      </div>
    </SidebarFooter>
  </Sidebar>;
}
