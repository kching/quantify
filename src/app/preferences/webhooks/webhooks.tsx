"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Portfolio, WebhookConfig } from "@/core/types";

interface WebhookListItem extends WebhookConfig {
  status: "healthy" | "error";
  lastUpdated: number;
}

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
  initialWebhooks: WebhookListItem[];
  portfolios: Array<Pick<Portfolio, "id" | "name">>;
}): React.JSX.Element {
  const [webhooks, setWebhooks] = useState<WebhookListItem[]>(initialWebhooks);
  const [form, setForm] = useState<WebhookForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const pageCount = Math.max(1, Math.ceil(webhooks.length / pageSize));
  const visibleWebhooks = webhooks.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  async function loadWebhooks(): Promise<void> {
    try {
      const response = await fetch("/api/preferences/webhooks");
      const body = await readResponse(response);
      if (!response.ok)
        throw new Error(String(body.error ?? "Unable to load webhooks."));
      const nextWebhooks = Array.isArray(body.webhooks)
        ? (body.webhooks as WebhookListItem[])
        : [];
      setWebhooks(nextWebhooks);
      setPage((current) =>
        Math.min(
          current,
          Math.max(1, Math.ceil(nextWebhooks.length / pageSize)),
        ),
      );
    } catch (reason) {
      setError(true);
      setMessage(
        reason instanceof Error ? reason.message : "Unable to load webhooks.",
      );
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
    setDialogOpen(true);
  }

  function startAdd(): void {
    resetForm();
    setMessage("");
    setError(false);
    setDialogOpen(true);
  }

  function resetForm(): void {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(false);
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
      setPage(1);
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
    <div className="space-y-6">
      <header className="page-heading">
        <div>
          <p className="section-kicker">PREFERENCES · INTEGRATIONS</p>
          <h1>Webhooks</h1>
          <p className="page-subtitle">
            Send candle and signal updates to your downstream systems.
          </p>
        </div>
      </header>
      {message && !dialogOpen && (
        <p
          className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
          role="status"
        >
          {message}
        </p>
      )}

      <section
        className="space-y-3"
        aria-labelledby="configured-webhooks-heading"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2
              id="configured-webhooks-heading"
              className="text-xl font-semibold"
            >
              Configured webhooks
            </h2>
            <p className="text-sm text-muted-foreground">
              {webhooks.length} configured endpoint
              {webhooks.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button type="button" onClick={startAdd}>
            Add webhook
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Webhook
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Last updated
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleWebhooks.map((webhook) => (
                <tr key={webhook.id}>
                  <td className="max-w-0 px-4 py-3">
                    <p className="truncate font-medium">{webhook.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {webhook.url}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${webhook.status === "healthy" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}
                    >
                      {webhook.status === "healthy" ? "Healthy" : "Error"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {webhook.lastUpdated
                      ? new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(webhook.lastUpdated)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
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
                  </td>
                </tr>
              ))}
              {webhooks.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No webhooks configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {webhooks.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              Rows per page
              <select
                className="h-9 rounded-md border bg-background px-2 text-foreground"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>

      <DialogRoot
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <CardHeader className="px-0 pt-0">
            <DialogTitle className="text-xl font-semibold">
              {editingId === null ? "Add a webhook" : "Edit webhook"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Configure an HTTP endpoint. Successful responses must use a 2xx
              status.
            </DialogDescription>
          </CardHeader>
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
              <Button
                type="button"
                variant="outline"
                onClick={() => resetForm()}
              >
                Cancel
              </Button>
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
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
