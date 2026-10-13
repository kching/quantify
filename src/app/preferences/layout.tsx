import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/current-user";
import PreferencesNavigation from "./preferences-navigation";
import "@/components/AppSidebar/AppSidebar.css";
import "./preferences-layout.css";

export default async function PreferencesLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const firstName = user.name.trim().split(/\s+/)[0] || "User";
  return (
    <div className="app-shell preferences-shell" id="top">
      <Sidebar className="preferences-sidebar">
        <SidebarHeader>
          <Link className="sidebar-brand preferences-brand" href="/dashboard">
            <span className="sidebar-logo">Q</span>
            <span className="sidebar-brand-copy">
              quantify<span>.</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <div className="preferences-sidebar-heading">PREFERENCES</div>
          <PreferencesNavigation />
        </SidebarContent>
        <SidebarFooter>
          <div className="preferences-user">
            <span
              className="profile-avatar"
              aria-hidden="true"
              style={
                user.image
                  ? { backgroundImage: `url(${user.image})` }
                  : undefined
              }
            >
              {user.image ? null : firstName.charAt(0).toUpperCase()}
            </span>
            <span>
              <strong>{firstName}</strong>
              <small>Preferences</small>
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="app-main preferences-main">
        <div className="preferences-content">
          <div className="preferences-back">
            <Link href="/dashboard">
              <ArrowLeft />
              Back to workspace
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
