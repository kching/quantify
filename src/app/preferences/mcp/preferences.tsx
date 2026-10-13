"use client";

import { useEffect, useState } from "react";

interface TokenRecord {
  id: number;
  label: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export default function McpPreferences(): React.JSX.Element {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [label, setLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const endpoint =
    typeof window === "undefined"
      ? "/api/mcp"
      : `${window.location.origin}/api/mcp`;
  async function refresh(): Promise<void> {
    const response = await fetch("/api/preferences/mcp-tokens", {
      cache: "no-store",
    });
    const body = (await response.json()) as { tokens?: TokenRecord[] };
    if (response.ok) setTokens(body.tokens ?? []);
  }
  useEffect(() => {
    let active = true;
    void fetch("/api/preferences/mcp-tokens", { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json()) as { tokens?: TokenRecord[] },
      }))
      .then(({ response, body }) => {
        if (active && response.ok) setTokens(body.tokens ?? []);
      });
    return () => {
      active = false;
    };
  }, []);
  async function createToken(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");
    setNewToken(null);
    const response = await fetch("/api/preferences/mcp-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const body = (await response.json()) as { error?: string; token?: string };
    if (!response.ok || !body.token) {
      setError(body.error ?? "Unable to create token.");
      return;
    }
    setNewToken(body.token);
    setLabel("");
    await refresh();
  }
  async function revoke(id: number): Promise<void> {
    await fetch(`/api/preferences/mcp-tokens?id=${id}`, { method: "DELETE" });
    await refresh();
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <a href="/preferences/telegram" className="text-sm underline">
        ← Preferences
      </a>
      <header>
        <p className="text-sm uppercase tracking-wide">
          Preferences · Integrations
        </p>
        <h1 className="text-3xl font-semibold">Model Context Protocol</h1>
        <p className="mt-2 text-muted-foreground">
          Connect AI clients to your Quantify portfolios, sweeps, signals,
          trades, and webhooks.
        </p>
      </header>
      <section className="space-y-4 rounded-lg border p-5">
        <h2 className="text-xl font-semibold">Personal access tokens</h2>
        <p>
          Tokens expire after one year. Each token is shown only once; store it
          securely.
        </p>
        <form
          onSubmit={(event) => void createToken(event)}
          className="flex gap-2"
        >
          <input
            aria-label="Token label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={100}
            required
            placeholder="e.g. Claude Desktop"
            className="min-w-0 flex-1 rounded border px-3 py-2"
          />
          <button className="rounded bg-primary px-4 py-2 text-primary-foreground">
            Create token
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
        {newToken && (
          <div className="space-y-2 rounded border p-3">
            <strong>Copy this token now. It will not be shown again.</strong>
            <code className="block break-all">{newToken}</code>
          </div>
        )}
        <p>
          MCP endpoint: <code>{endpoint}</code>
        </p>
        <ul className="space-y-3">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between gap-3 border-t pt-3"
            >
              <span>
                <strong>{token.label}</strong>
                <small className="block">
                  {token.revokedAt
                    ? "Revoked"
                    : `Expires ${new Date(token.expiresAt).toLocaleDateString()}`}{" "}
                  ·{" "}
                  {token.lastUsedAt
                    ? `Last used ${new Date(token.lastUsedAt).toLocaleString()}`
                    : "Never used"}
                </small>
              </span>
              {!token.revokedAt && (
                <button
                  onClick={() => void revoke(token.id)}
                  className="rounded border px-3 py-1"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
