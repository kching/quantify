"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
  const [dialogOpen, setDialogOpen] = useState(false);
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

  async function createToken(event: FormEvent<HTMLFormElement>): Promise<void> {
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
    setDialogOpen(false);
    await refresh();
  }

  async function revoke(id: number): Promise<void> {
    const response = await fetch(`/api/preferences/mcp-tokens?id=${id}`, {
      method: "DELETE",
    });
    if (response.ok) await refresh();
  }

  return (
    <div className="space-y-6">
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

      {newToken && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <strong>Copy this token now. It will not be shown again.</strong>
          <code className="block break-all">{newToken}</code>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <section className="space-y-3" aria-labelledby="mcp-tokens-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="mcp-tokens-heading" className="text-xl font-semibold">
              Personal access tokens
            </h2>
            <p className="text-sm text-muted-foreground">
              Tokens expire after one year. Each token is shown once; store it
              securely.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setLabel("");
              setError("");
              setDialogOpen(true);
            }}
          >
            Add token
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Configuration
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Last used
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tokens.map((token) => (
                <tr key={token.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{token.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(token.expiresAt).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${token.revokedAt ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}
                    >
                      {token.revokedAt ? "Revoked" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {token.lastUsedAt
                      ? new Date(token.lastUsedAt).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!token.revokedAt && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void revoke(token.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {tokens.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No access tokens configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">
          MCP endpoint: <code>{endpoint}</code>
        </p>
      </section>

      <DialogRoot open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <div className="mb-5 space-y-2">
            <DialogTitle className="text-xl font-semibold">
              Add access token
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Create a personal token for an MCP client. Tokens expire after one
              year and are shown only once.
            </DialogDescription>
          </div>
          <form
            onSubmit={(event) => void createToken(event)}
            className="space-y-4"
          >
            <label className="block space-y-1 text-sm">
              Token label
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={100}
                required
                placeholder="e.g. Claude Desktop"
              />
            </label>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create token</Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
