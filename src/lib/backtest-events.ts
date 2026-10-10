import type { BacktestResult, StrategyParams } from "@/core/types";

export interface BacktestRunEvent {
  runIndex: number;
  params: StrategyParams;
  result: BacktestResult;
}

interface BacktestEventChannel {
  listeners: Set<BacktestEventListener>;
  events: Array<{ id: number; run: BacktestRunEvent }>;
  nextEventId: number;
  completed: boolean;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

interface BacktestEventListener {
  send: (id: number, run: BacktestRunEvent) => void;
}

type BacktestEventRegistry = Map<string, BacktestEventChannel>;

const registryKey = "__quantifyBacktestEventRegistry" as const;
type RegistryGlobal = typeof globalThis & {
  __quantifyBacktestEventRegistry?: BacktestEventRegistry;
};

function registry(): BacktestEventRegistry {
  const root = globalThis as RegistryGlobal;
  root[registryKey] ??= new Map();
  return root[registryKey];
}

function getChannel(batchId: string): BacktestEventChannel {
  const channels = registry();
  let channel = channels.get(batchId);
  if (!channel) {
    channel = {
      listeners: new Set(),
      events: [],
      nextEventId: 1,
      completed: false,
    };
    channels.set(batchId, channel);
  }
  return channel;
}

function scheduleChannelCleanup(
  batchId: string,
  channel: BacktestEventChannel,
): void {
  if (channel.cleanupTimer) clearTimeout(channel.cleanupTimer);
  channel.cleanupTimer = setTimeout(() => {
    if (channel.listeners.size === 0) registry().delete(batchId);
  }, 5 * 60_000);
  const timer = channel.cleanupTimer as ReturnType<typeof setTimeout> & {
    unref?: () => void;
  };
  timer.unref?.();
}

export function subscribeBacktestEvents(
  batchId: string,
  lastEventId = 0,
): ReadableStream<Uint8Array> {
  const channel = getChannel(batchId);
  if (channel.cleanupTimer) clearTimeout(channel.cleanupTimer);
  const encoder = new TextEncoder();
  let subscriber: BacktestEventListener | undefined;
  let stopHeartbeat: (() => void) | undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 15_000);
      stopHeartbeat = () => clearInterval(heartbeat);
      const send = (id: number, run: BacktestRunEvent): void => {
        controller.enqueue(
          encoder.encode(
            `id: ${id}\nevent: result\ndata: ${JSON.stringify(run)}\n\n`,
          ),
        );
      };
      subscriber = { send };
      channel.listeners.add(subscriber);
      for (const event of channel.events)
        if (event.id > lastEventId) subscriber.send(event.id, event.run);
    },
    cancel() {
      stopHeartbeat?.();
      if (subscriber) channel.listeners.delete(subscriber);
      if (channel.listeners.size === 0)
        scheduleChannelCleanup(batchId, channel);
    },
  });
}

export function publishBacktestResult(
  batchId: string,
  run: BacktestRunEvent,
): void {
  const channel = registry().get(batchId);
  if (!channel) return;
  const id = channel.nextEventId++;
  channel.events.push({ id, run });
  channel.listeners.forEach((listener) => listener.send(id, run));
}

export function completeBacktestEvents(batchId: string): void {
  const channels = registry();
  const channel = channels.get(batchId);
  if (!channel) return;
  channel.completed = true;
  if (channel.listeners.size === 0) scheduleChannelCleanup(batchId, channel);
}
