"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { UserProfile } from "@/core/types";
import "./AppSidebar.css";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { DynamicIcon, IconName } from "lucide-react/dynamic";

type AppPage = "dashboard" | "research";
type NavItem = { id: string; label: string; icon: IconName; href: string };
interface AppSidebarProps {
  page: AppPage;
  navItems: NavItem[];
  hasPortfolio: boolean;
  user?: Pick<UserProfile, "name" | "image">;
}

const sections = new Set(["overview", "watchlist", "portfolio", "ledger"]);
const portfolioNavItems = new Set(["watchlist", "portfolio", "ledger"]);

function getActiveSection(): string {
  const hash = window.location.hash.slice(1);
  return sections.has(hash) ? hash : "overview";
}

export default function AppSidebar({
  page,
  navItems = [],
  hasPortfolio,
  user,
}: AppSidebarProps): React.JSX.Element {
  const [section, setSection] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dashboardActive = page === "dashboard";
  const displayName = user?.name ?? "Admin";
  const firstName = displayName.trim().split(/\s+/)[0] || "User";
  const avatarLabel = firstName.slice(0, 1).toUpperCase();
  const visibleNavItems = hasPortfolio
    ? navItems
    : navItems.filter((navItem) => !portfolioNavItems.has(navItem.id));

  useEffect(() => {
    const updateSection = (): void => setSection(getActiveSection());
    updateSection();
    window.addEventListener("hashchange", updateSection);
    window.addEventListener("popstate", updateSection);
    if (page !== "dashboard" || typeof IntersectionObserver === "undefined") {
      return () => {
        window.removeEventListener("hashchange", updateSection);
        window.removeEventListener("popstate", updateSection);
      };
    }
    let sectionTimer: number | undefined;
    const intersectingSections = new Map<string, IntersectionObserverEntry>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting)
            intersectingSections.set(entry.target.id, entry);
          else intersectingSections.delete(entry.target.id);
        }
        const visibleSections = [...intersectingSections.values()].sort(
          (left, right) =>
            left.boundingClientRect.top - right.boundingClientRect.top,
        );
        const activeSection = visibleSections[0]?.target.id;
        if (!activeSection || !sections.has(activeSection)) return;
        if (sectionTimer) window.clearTimeout(sectionTimer);
        sectionTimer = window.setTimeout(() => {
          setSection((currentSection) =>
            currentSection === activeSection ? currentSection : activeSection,
          );
          if (window.location.hash !== `#${activeSection}`)
            window.history.replaceState(null, "", `#${activeSection}`);
        }, 150);
      },
      { rootMargin: "-80px 0px -75% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const sectionId of sections) {
      const element = document.getElementById(sectionId);
      if (element) observer.observe(element);
    }
    return () => {
      if (sectionTimer) window.clearTimeout(sectionTimer);
      observer.disconnect();
      window.removeEventListener("hashchange", updateSection);
      window.removeEventListener("popstate", updateSection);
    };
  }, [hasPortfolio, page]);

  return (
    <Sidebar data-collapsed={collapsed}>
      <SidebarHeader>
        <button
          className="sidebar-brand"
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className="sidebar-logo">Q</span>
          <span className="sidebar-brand-copy">
            quantify<span>.</span>
          </span>
        </button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {visibleNavItems.map((navItem) => (
              <SidebarMenuItem key={navItem.id}>
                <SidebarMenuButton
                  href={navItem.href}
                  title={navItem.label}
                  ariaLabel={navItem.label}
                  isActive={dashboardActive && section === navItem.id}
                  onClick={() => setSection(navItem.id)}
                >
                  <DynamicIcon name={navItem.icon} />
                  <span className="sidebar-menu-label">{navItem.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="sidebar-profile-wrap">
          <button
            className="sidebar-profile"
            type="button"
            aria-label="Open account menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((value) => !value)}
          >
            <span
              className="profile-avatar"
              aria-hidden="true"
              style={
                user?.image
                  ? { backgroundImage: `url(${user.image})` }
                  : undefined
              }
            >
              {user?.image ? null : avatarLabel}
            </span>
            <span className="sidebar-profile-copy">
              <strong>{firstName}</strong>
            </span>
          </button>
          {profileOpen && (
            <div className="profile-menu" role="menu">
              <Link
                href="/preferences/telegram"
                role="menuitem"
                onClick={() => setProfileOpen(false)}
              >
                Preferences
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => void signOut({ callbackUrl: "/" })}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
