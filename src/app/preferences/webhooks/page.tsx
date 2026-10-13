import { getCurrentUser } from "@/lib/current-user";
import { listWebhookConfigs } from "@/core/db";
import { redirect } from "next/navigation";
import WebhooksPreferences from "./webhooks";

export default async function WebhooksPreferencesPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const webhooks = await listWebhookConfigs(user.id);
  return <WebhooksPreferences initialWebhooks={webhooks} />;
}
