"use client";

import { usePathname } from "next/navigation";
import { Bot, MessageCircle, Webhook } from "lucide-react";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const preferenceLinks = [
  {
    href: "/preferences/telegram",
    label: "Telegram",
    Icon: MessageCircle,
  },
  { href: "/preferences/webhooks", label: "Webhooks", Icon: Webhook },
  { href: "/preferences/mcp", label: "MCP access", Icon: Bot },
] as const;

export default function PreferencesNavigation(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarMenu aria-label="Preference pages">
        {preferenceLinks.map(({ href, label, Icon }) => (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              href={href}
              isActive={pathname === href}
              ariaLabel={label}
              title={label}
            >
              <Icon />
              <span className="sidebar-menu-label">{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
