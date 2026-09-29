'use client';

import { useState, useSyncExternalStore } from 'react';
import { Activity, BarChart3, CircleHelp, LayoutDashboard, Wallet } from 'lucide-react';
import Link from 'next/link';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
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

export default function AppSidebar({ page }: { page: AppPage }): React.JSX.Element {
  const section = useSyncExternalStore(subscribeToLocation, getActiveSection, () => 'overview');
  const [collapsed, setCollapsed] = useState(false);
  const dashboardActive = page === 'dashboard';

  return <Sidebar data-collapsed={collapsed}>
    <SidebarHeader>
      <Link className="sidebar-brand" href="/#top" aria-label="Quantify home">
        <span className="sidebar-logo">Q</span>
        <span className="sidebar-brand-copy">quantify<span>.</span></span>
      </Link>
      <SidebarTrigger collapsed={collapsed} onClick={() => setCollapsed((value) => !value)}/>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>WORKSPACE</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton href="/#overview" title="Overview" ariaLabel="Overview" isActive={dashboardActive && section === 'overview'}><LayoutDashboard/><span className="sidebar-menu-label">Overview</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton href="/#portfolio" title="Portfolio signals" ariaLabel="Portfolio signals" isActive={dashboardActive && section === 'portfolio'}><BarChart3/><span className="sidebar-menu-label">Portfolio signals</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton href="/#performance" title="P&L performance" ariaLabel="P&L performance" isActive={dashboardActive && section === 'performance'}><Activity/><span className="sidebar-menu-label">P&amp;L performance</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton href="/#ledger" title="Trade & cash ledger" ariaLabel="Trade & cash ledger" isActive={dashboardActive && section === 'ledger'}><Wallet/><span className="sidebar-menu-label">Trade &amp; cash ledger</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton href="/research" title="Strategy research" ariaLabel="Strategy research" isActive={page === 'research'}><Activity/><span className="sidebar-menu-label">Strategy research</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <div className="sidebar-help"><CircleHelp/><span>Decision support only<br/><small>No orders are sent</small></span></div>
      <div className="sidebar-profile"><span className="profile-avatar" aria-label="admin">A</span><span className="sidebar-profile-copy"><strong>admin</strong><small>Local workspace</small></span></div>
    </SidebarFooter>
  </Sidebar>;
}
