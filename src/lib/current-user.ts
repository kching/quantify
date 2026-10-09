import type { UserProfile } from "@/core/types";

export async function getCurrentUser(): Promise<UserProfile | null> {
  if (process.env.NODE_ENV === "test")
    return {
      id: "admin",
      name: "Admin",
      email: null,
      image: null,
      isAnonymous: true,
      createdAt: 0,
      updatedAt: 0,
    };
  const session = await (await import("./auth")).auth();
  if (session?.user?.id)
    return (await import("@/core/db")).getUserProfile(session.user.id);
  return null;
}
