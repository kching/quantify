import { Button as BaseButton } from "@base-ui/react/button";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ComponentProps, MouseEventHandler, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Sidebar({
  className,
  ...props
}: ComponentProps<"aside">): React.JSX.Element {
  return (
    <aside
      data-slot="sidebar"
      className={cn("app-sidebar", className)}
      {...props}
    />
  );
}

export function SidebarHeader({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("sidebar-header", className)}
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("sidebar-content", className)}
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("sidebar-group", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn("sidebar-label", className)}
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: ComponentProps<"nav">): React.JSX.Element {
  return (
    <nav
      data-slot="sidebar-menu"
      aria-label={props["aria-label"] ?? "Workspace navigation"}
      className={cn("sidebar-nav", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-menu-item"
      className={cn("sidebar-menu-item", className)}
      {...props}
    />
  );
}

interface SidebarMenuButtonProps {
  href: string;
  isActive?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export function SidebarMenuButton({
  href,
  isActive = false,
  children,
  className,
  title,
  ariaLabel,
  onClick,
}: SidebarMenuButtonProps): React.JSX.Element {
  return (
    <BaseButton
      nativeButton={false}
      render={
        <Link
          href={href}
          aria-current={isActive ? "page" : undefined}
          onClick={onClick}
        />
      }
      role="link"
      aria-label={ariaLabel}
      data-slot="sidebar-menu-button"
      data-active={isActive || undefined}
      title={title}
      className={cn("nav-item", isActive && "active", className)}
    >
      {children}
    </BaseButton>
  );
}

export function SidebarTrigger({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <BaseButton
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      onClick={onClick}
      className="sidebar-trigger"
    >
      {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </BaseButton>
  );
}

export function SidebarFooter({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("sidebar-footer", className)}
      {...props}
    />
  );
}
