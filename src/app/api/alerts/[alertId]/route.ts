import { deleteAlert } from "@/core/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ alertId: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });

  const { alertId: rawAlertId } = await context.params;
  const alertId = Number(rawAlertId);
  if (!Number.isSafeInteger(alertId) || alertId < 1)
    return Response.json({ error: "Invalid alert." }, { status: 400 });

  const deleted = await deleteAlert(alertId, user.id);
  if (!deleted)
    return Response.json({ error: "Alert not found." }, { status: 404 });
  return Response.json({ ok: true });
}
