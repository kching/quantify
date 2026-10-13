import { getCurrentUser } from "@/lib/current-user";
import { listPortfolios, listWebhookConfigs } from "@/core/db";
import { redirect } from "next/navigation";
import WebhooksPreferences from "./webhooks";

export default async function WebhooksPreferencesPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [webhooks, portfolios] = await Promise.all([
    listWebhookConfigs(user.id),
    listPortfolios(user.id),
  ]);
  return (
    <WebhooksPreferences
      initialWebhooks={webhooks}
      portfolios={portfolios.map(({ id, name }) => ({ id, name }))}
    />
  );
}
