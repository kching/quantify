import {
  createWebhookConfig,
  deleteWebhookConfig,
  getLatestWebhookDeliveryLog,
  listPortfolios,
  listWebhookConfigs,
  updateWebhookConfig,
} from "@/core/db";
import { sendWebhookPortfolioSnapshot } from "@/core/market";
import type { WebhookConfigInput } from "@/core/types";
import { getCurrentUser } from "@/lib/current-user";

function parseWebhookInput(value: unknown): WebhookConfigInput | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.url !== "string") return null;
  let url: URL;
  try {
    url = new URL(body.url.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const label = typeof body.label === "string" ? body.label.trim() : "Webhook";
  const clientId = body.clientId;
  const secretToken = body.secretToken;
  const excludedPortfolioIds = body.excludedPortfolioIds;
  if (
    !label ||
    label.length > 100 ||
    (clientId !== undefined &&
      clientId !== null &&
      typeof clientId !== "string") ||
    (secretToken !== undefined &&
      secretToken !== null &&
      typeof secretToken !== "string") ||
    (excludedPortfolioIds !== undefined &&
      (!Array.isArray(excludedPortfolioIds) ||
        excludedPortfolioIds.some(
          (id) => !Number.isSafeInteger(id) || (id as number) < 1,
        )))
  ) {
    return null;
  }
  return {
    label,
    url: url.toString(),
    clientId: typeof clientId === "string" ? clientId.trim() || null : null,
    secretToken:
      typeof secretToken === "string" ? secretToken.trim() || null : null,
    excludedPortfolioIds: Array.isArray(excludedPortfolioIds)
      ? [...new Set(excludedPortfolioIds as number[])]
      : [],
  };
}

async function exclusionsBelongToUser(
  userId: string,
  input: WebhookConfigInput,
): Promise<boolean> {
  const portfolioIds = new Set(
    (await listPortfolios(userId)).map(({ id }) => id),
  );
  return (input.excludedPortfolioIds ?? []).every((id) => portfolioIds.has(id));
}

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to view webhooks." },
      { status: 401 },
    );
  const webhooks = await listWebhookConfigs(user.id);
  const items = await Promise.all(
    webhooks.map(async (webhook) => {
      const latest = await getLatestWebhookDeliveryLog(user.id, webhook.id);
      return {
        ...webhook,
        status: latest?.status === "success" ? "healthy" : "error",
        lastUpdated: latest?.timestamp ?? webhook.updatedAt,
      };
    }),
  );
  return Response.json({ webhooks: items });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to add a webhook." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid webhook configuration." },
      { status: 400 },
    );
  }
  const input = parseWebhookInput(body);
  if (!input)
    return Response.json(
      { error: "Enter a label and a valid HTTP or HTTPS URL." },
      { status: 400 },
    );
  if (!(await exclusionsBelongToUser(user.id, input)))
    return Response.json(
      { error: "Select portfolios that belong to your account." },
      { status: 400 },
    );
  const webhook = await createWebhookConfig(user.id, input);
  const initialSync = await sendWebhookPortfolioSnapshot(webhook);
  const status =
    initialSync.attempted === 0
      ? "no_data"
      : initialSync.failed === 0
        ? "success"
        : initialSync.delivered === 0
          ? "failed"
          : "partial";
  const message =
    initialSync.attempted === 0
      ? "No current portfolio data was available to send."
      : initialSync.failed === 0
        ? `Sent ${initialSync.delivered} current portfolio update${initialSync.delivered === 1 ? "" : "s"}.`
        : `Sent ${initialSync.delivered} of ${initialSync.attempted} current portfolio updates; ${initialSync.failed} failed.${initialSync.warnings[0] ? ` ${initialSync.warnings[0]}` : ""}`;
  return Response.json(
    {
      webhook,
      initialSync: {
        ...initialSync,
        status,
        message,
      },
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to update webhooks." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid webhook configuration." },
      { status: 400 },
    );
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !Number.isSafeInteger((body as { id?: unknown }).id)
  )
    return Response.json({ error: "Invalid webhook ID." }, { status: 400 });
  const input = parseWebhookInput(body);
  if (!input)
    return Response.json(
      { error: "Enter a label and a valid HTTP or HTTPS URL." },
      { status: 400 },
    );
  if (!(await exclusionsBelongToUser(user.id, input)))
    return Response.json(
      { error: "Select portfolios that belong to your account." },
      { status: 400 },
    );
  const webhook = await updateWebhookConfig(
    user.id,
    (body as { id: number }).id,
    input,
  );
  return webhook
    ? Response.json({ webhook })
    : Response.json({ error: "Webhook not found." }, { status: 404 });
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to delete webhooks." },
      { status: 401 },
    );
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: "Invalid webhook ID." }, { status: 400 });
  const deleted = await deleteWebhookConfig(user.id, id);
  return deleted
    ? Response.json({ success: true })
    : Response.json({ error: "Webhook not found." }, { status: 404 });
}
