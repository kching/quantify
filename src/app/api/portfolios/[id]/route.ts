import { deletePortfolio } from '@/core/db';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid portfolio.' }, { status: 400 });
  await deletePortfolio(id);
  return Response.json({ ok: true });
}
