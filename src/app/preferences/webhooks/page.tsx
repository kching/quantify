import { getCurrentUser } from "@/lib/current-user";
import {
  getLatestWebhookDeliveryLog,
  listPortfolios,
  listWebhookConfigs,
} from "@/core/db";
import { redirect } from "next/navigation";
import WebhooksPreferences from "./webhooks";

export default async function WebhooksPreferencesPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [webhooks, portfolios] = await Promise.all([
    listWebhookConfigs(user.id),
    listPortfolios(user.id),
  ]);
  const initialWebhooks = await Promise.all(
    webhooks.map(async (webhook) => {
      const latest = await getLatestWebhookDeliveryLog(user.id, webhook.id);
      return {
        ...webhook,
        status:
          latest?.status === "success"
            ? ("healthy" as const)
            : ("error" as const),
        lastUpdated: latest?.timestamp ?? webhook.updatedAt,
      };
    }),
  );
  return (
    <WebhooksPreferences
      initialWebhooks={initialWebhooks}
      portfolios={portfolios.map(({ id, name }) => ({ id, name }))}
    />
  );
}
