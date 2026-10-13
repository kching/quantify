"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Portfolio, WebhookConfig } from "@/core/types";

interface WebhookForm {
  label: string;
  url: string;
  clientId: string;
  secretToken: string;
  excludedPortfolioIds: number[];
}

const emptyForm: WebhookForm = {
  label: "",
  url: "",
  clientId: "",
  secretToken: "",
  excludedPortfolioIds: [],
};

async function readResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const data: unknown = await response.json();
  if (typeof data === "object" && data !== null)
    return data as Record<string, unknown>;
  return {};
}

export default function WebhooksPreferences({
  initialWebhooks,
  portfolios,
}: {
  initialWebhooks: WebhookConfig[];
  portfolios: Array<Pick<Portfolio, "id" | "name">>;
}): React.JSX.Element {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>(initialWebhooks);
  const [form, setForm] = useState<WebhookForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(true);

  async function loadWebhooks(): Promise<void> {
    try {
      const response = await fetch("/api/preferences/webhooks");
      const body = await readResponse(response);
      if (!response.ok)
        throw new Error(String(body.error ?? "Unable to load webhooks."));
      setWebhooks(
        Array.isArray(body.webhooks) ? (body.webhooks as WebhookConfig[]) : [],
      );
    } catch (reason) {
      setError(true);
      setMessage(
        reason instanceof Error ? reason.message : "Unable to load webhooks.",
      );
    } finally {
      setLoaded(true);
    }
  }

  function startEdit(webhook: WebhookConfig): void {
    setEditingId(webhook.id);
    setForm({
      label: webhook.label,
      url: webhook.url,
      clientId: webhook.clientId ?? "",
      secretToken: webhook.secretToken ?? "",
      excludedPortfolioIds: webhook.excludedPortfolioIds ?? [],
    });
    setMessage("");
  }

  function resetForm(): void {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveWebhook(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const creating = editingId === null;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch("/api/preferences/webhooks", {
        method: editingId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editingId }),
      });
      const body = await readResponse(response);
      if (!response.ok)
        throw new Error(String(body.error ?? "Unable to save webhook."));
      resetForm();
      await loadWebhooks();
      if (creating) {
        const initialSync = body.initialSync;
        if (
          typeof initialSync === "object" &&
          initialSync !== null &&
          "status" in initialSync &&
          "message" in initialSync
        ) {
          const sync = initialSync as {
            status: unknown;
            message: unknown;
          };
          const status = sync.status;
          const deliveryIssue = status === "failed" || status === "partial";
          setError(deliveryIssue);
          setMessage(
            `Webhook added. ${typeof sync.message === "string" ? sync.message : "Initial delivery finished."}`,
          );
        } else {
          setError(true);
          setMessage(
            "Webhook added, but initial delivery status is unavailable.",
          );
        }
      } else {
        setMessage("Webhook updated.");
      }
    } catch (reason) {
      setError(true);
      setMessage(
        reason instanceof Error ? reason.message : "Unable to save webhook.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeWebhook(id: number): Promise<void> {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch(`/api/preferences/webhooks?id=${id}`, {
        method: "DELETE",
      });
      const body = await readResponse(response);
      if (!response.ok)
        throw new Error(String(body.error ?? "Unable to delete webhook."));
      if (editingId === id) resetForm();
      await loadWebhooks();
      setMessage("Webhook removed.");
    } catch (reason) {
      setError(true);
      setMessage(
        reason instanceof Error ? reason.message : "Unable to delete webhook.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6 md:p-10">
      <div className="text-sm text-muted-foreground">
        <Link href="/preferences/telegram" className="underline">
          User preferences
        </Link>{" "}
        / Webhooks
      </div>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Webhooks</h1>
        <p className="text-muted-foreground">
          Send candle and signal updates to your downstream systems.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {editingId === null ? "Add a webhook" : "Edit webhook"}
          </CardTitle>
          <CardDescription>
            Configure an HTTP endpoint. Successful responses must use a 2xx
            status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => void saveWebhook(event)}
          >
            <label className="block space-y-1 text-sm">
              Label
              <Input
                required
                maxLength={100}
                value={form.label}
                onChange={(event) =>
                  setForm({ ...form, label: event.target.value })
                }
                placeholder="Production alerts"
              />
            </label>
            <label className="block space-y-1 text-sm">
              Webhook URL
              <Input
                required
                type="url"
                value={form.url}
                onChange={(event) =>
                  setForm({ ...form, url: event.target.value })
                }
                placeholder="https://example.com/webhook"
              />
            </label>
            <label className="block space-y-1 text-sm">
              Client ID{" "}
              <span className="text-muted-foreground">(optional)</span>
              <Input
                value={form.clientId}
                onChange={(event) =>
                  setForm({ ...form, clientId: event.target.value })
                }
              />
            </label>
            <label className="block space-y-1 text-sm">
              Secret token{" "}
              <span className="text-muted-foreground">(optional)</span>
              <Input
                type="password"
                autoComplete="new-password"
                value={form.secretToken}
                onChange={(event) =>
                  setForm({ ...form, secretToken: event.target.value })
                }
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Exclude portfolios from this webhook
              </legend>
              <p className="text-xs text-muted-foreground">
                Candle and signal events are sent when they belong to a
                portfolio that is not excluded.
              </p>
              {portfolios.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create a portfolio to configure event routing.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {portfolios.map((portfolio) => (
                    <label
                      key={portfolio.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.excludedPortfolioIds.includes(
                          portfolio.id,
                        )}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            excludedPortfolioIds: event.target.checked
                              ? [...form.excludedPortfolioIds, portfolio.id]
                              : form.excludedPortfolioIds.filter(
                                  (id) => id !== portfolio.id,
                                ),
                          })
                        }
                      />
                      {portfolio.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : editingId === null
                    ? "Add webhook"
                    : "Save changes"}
              </Button>
              {editingId !== null && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
          {message && (
            <p
              className={`mt-4 text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
              role="status"
            >
              {message}
            </p>
          )}
        </CardContent>
      </Card>

      <section
        className="space-y-3"
        aria-labelledby="configured-webhooks-heading"
      >
        <h2 id="configured-webhooks-heading" className="text-xl font-semibold">
          Configured webhooks
        </h2>
        {loaded && webhooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No webhooks configured yet.
          </p>
        ) : (
          webhooks.map((webhook) => (
            <Card key={webhook.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <h3 className="font-medium">{webhook.label}</h3>
                  <p className="truncate text-sm text-muted-foreground">
                    {webhook.url}
                  </p>
                  {webhook.clientId && (
                    <p className="text-xs text-muted-foreground">
                      Client ID: {webhook.clientId}
                    </p>
                  )}
                  {webhook.secretToken && (
                    <p className="text-xs text-muted-foreground">
                      Secret token configured
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {webhook.excludedPortfolioIds?.length
                      ? `Excludes: ${webhook.excludedPortfolioIds.map((id) => portfolios.find((portfolio) => portfolio.id === id)?.name ?? `Portfolio ${id}`).join(", ")}`
                      : "Receives events from all portfolios"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => startEdit(webhook)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void removeWebhook(webhook.id)}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
