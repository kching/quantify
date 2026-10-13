export const MCP_TOKEN_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

export function createMcpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `qcp_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function hashMcpSecret(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
