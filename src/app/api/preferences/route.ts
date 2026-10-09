import { getUserPreferences, updateUserPreferences } from "@/core/db";
import type { UserPreferences } from "@/core/types";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to view preferences." },
      { status: 401 },
    );
  return Response.json({ preferences: await getUserPreferences(user.id) });
}

export async function PATCH(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to update preferences." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Preferences must be valid JSON." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json(
      { error: "Preferences must be a JSON object." },
      { status: 400 },
    );
  const updates = (body as { preferences?: unknown }).preferences;
  if (!updates || typeof updates !== "object" || Array.isArray(updates))
    return Response.json(
      { error: "Preferences must be a JSON object." },
      { status: 400 },
    );
  const preferences = await updateUserPreferences(
    user.id,
    updates as UserPreferences,
  );
  return Response.json({ preferences });
}
