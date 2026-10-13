import {
  createWebhookConfig,
  deleteWebhookConfig,
  listWebhookConfigs,
  updateWebhookConfig,
} from "@/core/db";
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
  if (
    !label ||
    label.length > 100 ||
    (clientId !== undefined && clientId !== null && typeof clientId !== "string") ||
    (secretToken !== undefined && secretToken !== null && typeof secretToken !== "string")
  ) {
    return null;
  }
  return {
    label,
    url: url.toString(),
    clientId: typeof clientId === "string" ? clientId.trim() || null : null,
    secretToken: typeof secretToken === "string" ? secretToken.trim() || null : null,
  };
}

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in to view webhooks." }, { status: 401 });
  return Response.json({ webhooks: await listWebhookConfigs(user.id) });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in to add a webhook." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid webhook configuration." }, { status: 400 });
  }
  const input = parseWebhookInput(body);
  if (!input)
    return Response.json({ error: "Enter a label and a valid HTTP or HTTPS URL." }, { status: 400 });
  const webhook = await createWebhookConfig(user.id, input);
  return Response.json({ webhook }, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in to update webhooks." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid webhook configuration." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !Number.isSafeInteger((body as { id?: unknown }).id))
    return Response.json({ error: "Invalid webhook ID." }, { status: 400 });
  const input = parseWebhookInput(body);
  if (!input)
    return Response.json({ error: "Enter a label and a valid HTTP or HTTPS URL." }, { status: 400 });
  const webhook = await updateWebhookConfig(user.id, (body as { id: number }).id, input);
  return webhook
    ? Response.json({ webhook })
    : Response.json({ error: "Webhook not found." }, { status: 404 });
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in to delete webhooks." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: "Invalid webhook ID." }, { status: 400 });
  const deleted = await deleteWebhookConfig(user.id, id);
  return deleted
    ? Response.json({ success: true })
    : Response.json({ error: "Webhook not found." }, { status: 404 });
}
