import { subscribeToMarketUpdates, type MarketUpdateEvent } from '@/core/market-update-events';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

function formatEvent(event: MarketUpdateEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function GET(): Promise<Response> {
  if (!(await getCurrentUser())) return Response.json({ error: 'Sign in required.' }, { status: 401 });

  let unsubscribe = (): void => undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller): void {
      const send = (event: MarketUpdateEvent): void => controller.enqueue(formatEvent(event));
      unsubscribe = subscribeToMarketUpdates(send);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(': keep-alive\n\n')), 30_000);
      controller.enqueue(encoder.encode(': connected\n\n'));
    },
    cancel(): void {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    },
  });
}
