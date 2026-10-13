import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import McpPreferences from "./preferences";

export default async function McpPreferencesPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <McpPreferences />;
}
