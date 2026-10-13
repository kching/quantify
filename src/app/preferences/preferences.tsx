"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, MessageCircle, QrCode, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { UserProfile } from "@/core/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import "@/components/AppSidebar/AppSidebar.css";
import "./preferences.css";

interface TelegramApiResponse {
  error?: string;
  connectUrl?: string;
  connected?: boolean;
  configured?: boolean;
  expiresAt?: number;
}

async function readTelegramResponse(
  response: Response,
): Promise<TelegramApiResponse> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && !Array.isArray(body))
      return body as TelegramApiResponse;
  } catch {
    // Give the user the HTTP status when an upstream error returned HTML/text.
  }
  throw new Error(
    `The server returned an unreadable response (HTTP ${response.status}).`,
  );
}
interface PreferencesProps {
  user: Pick<UserProfile, "name" | "image">;
  initialConnected: boolean;
  botConfigured: boolean;
}

export default function Preferences({
  user,
  initialConnected,
  botConfigured,
}: PreferencesProps): React.JSX.Element {
  const [connected, setConnected] = useState(initialConnected);
  const [configured, setConfigured] = useState(botConfigured);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const firstName = user.name.trim().split(/\s+/)[0] || "User";

  useEffect(() => {
    if (!connectUrl || connected) return;
    let active = true;
    const checkConnection = async (): Promise<void> => {
      try {
        const response = await fetch("/api/preferences/telegram/connect", {
          cache: "no-store",
        });
        const body = await readTelegramResponse(response);
        if (!active || !response.ok) return;
        setConnected(Boolean(body.connected));
        setConfigured(Boolean(body.configured));
        if (body.connected) {
          setConnectUrl(null);
          setMessage({ text: "Telegram is connected.", error: false });
        }
      } catch {
        // Keep polling while the user switches to Telegram to start the bot.
      }
    };
    void checkConnection();
    const timer = window.setInterval(() => void checkConnection(), 2_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [connectUrl, connected]);

  async function createConnectionLink(): Promise<void> {
    setCreatingLink(true);
    setMessage(null);
    try {
      const response = await fetch("/api/preferences/telegram/connect", {
        method: "POST",
      });
      const body = await readTelegramResponse(response);
      if (!response.ok)
        throw new Error(body.error ?? "Unable to create a Telegram link.");
      if (!body.connectUrl)
        throw new Error("Telegram did not return a connection link.");
      setConnectUrl(body.connectUrl);
      setMessage({
        text: "Scan the QR code and tap Start in Telegram.",
        error: false,
      });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "Unable to create a Telegram connection link.",
        error: true,
      });
    } finally {
      setCreatingLink(false);
    }
  }

  async function testTelegram(): Promise<void> {
    setTesting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/preferences/telegram/test", {
        method: "POST",
      });
      const body = await readTelegramResponse(response);
      if (!response.ok)
        throw new Error(
          body.error ?? "Unable to send a Telegram test message.",
        );
      setMessage({ text: "Test message sent to Telegram.", error: false });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "Unable to send a Telegram test message.",
        error: true,
      });
    } finally {
      setTesting(false);
    }
  }

  async function disconnectTelegram(): Promise<void> {
    setDisconnecting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/preferences/telegram/connect", {
        method: "DELETE",
      });
      const body = await readTelegramResponse(response);
      if (!response.ok)
        throw new Error(body.error ?? "Unable to disconnect Telegram.");
      setConnected(false);
      setConnectUrl(null);
      setMessage({ text: "Telegram disconnected.", error: false });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "Unable to disconnect Telegram.",
        error: true,
      });
    } finally {
      setDisconnecting(false);
    }
  }

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
          <Link className="nav-item" href="/preferences/webhooks">
            <span className="sidebar-menu-label">Webhooks</span>
          </Link>
          <Link className="nav-item" href="/preferences/mcp">
            <span className="sidebar-menu-label">MCP access</span>
          </Link>
          <SidebarGroup>
            <SidebarMenu aria-label="Preference pages">
              <SidebarMenuItem>
                <SidebarMenuButton
                  href="/preferences/telegram"
                  isActive
                  ariaLabel="Telegram"
                  title="Telegram"
                >
                  <MessageCircle />
                  <span className="sidebar-menu-label">Telegram</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
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
          <header className="page-heading">
            <div>
              <p className="section-kicker">PREFERENCES · INTEGRATIONS</p>
              <h1>Telegram</h1>
              <p className="page-subtitle">
                Connect a Telegram bot to receive messages from Quantify.
              </p>
            </div>
          </header>
          <Card className="telegram-preferences-card">
            <CardHeader className="section-card-header">
              <div>
                <p className="section-kicker">TELEGRAM ACCOUNT</p>
                <CardTitle>Bot connection</CardTitle>
                <CardDescription>
                  Connect your Telegram chat to Quantify using a temporary QR
                  code. The app manages the bot for all users.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {!configured && (
                <p className="telegram-field-help" role="status">
                  Telegram is not configured yet. The app administrator needs to
                  set the shared bot token and webhook secret.
                </p>
              )}
              {connected ? (
                <p className="telegram-connected" role="status">
                  <Check /> Your Telegram chat is connected.
                </p>
              ) : (
                <p className="telegram-field-help">
                  Create a connection link, scan it with Telegram, then tap
                  Start. The link expires after 10 minutes.
                </p>
              )}
              {connectUrl && !connected && (
                <div className="telegram-qr-panel">
                  <QRCodeSVG
                    value={connectUrl}
                    size={256}
                    marginSize={4}
                    level="M"
                    title="Scan to connect Telegram to Quantify"
                  />
                  <a href={connectUrl} target="_blank" rel="noreferrer">
                    Open Telegram connection link
                  </a>
                </div>
              )}
              <div className="telegram-form-actions">
                {!connected && (
                  <Button
                    type="button"
                    disabled={!configured || creatingLink}
                    onClick={() => void createConnectionLink()}
                  >
                    <QrCode className="size-4" />
                    {creatingLink
                      ? "Creating link…"
                      : connectUrl
                        ? "Create a new QR code"
                        : "Connect Telegram"}
                  </Button>
                )}
                {connected && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={testing || disconnecting}
                      onClick={() => void testTelegram()}
                    >
                      {testing ? "Sending test…" : "Send test message"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={testing || disconnecting}
                      onClick={() => void disconnectTelegram()}
                    >
                      <Trash2 className="size-4" />
                      {disconnecting ? "Disconnecting…" : "Disconnect Telegram"}
                    </Button>
                  </>
                )}
                {message && (
                  <span
                    className={
                      message.error
                        ? "preferences-message error"
                        : "preferences-message"
                    }
                    role={message.error ? "alert" : "status"}
                  >
                    {!message.error && <Check />}
                    {message.text}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
