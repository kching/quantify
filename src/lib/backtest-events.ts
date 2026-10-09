import type { BacktestResult, StrategyParams } from "@/core/types";

export interface BacktestRunEvent {
  runIndex: number;
  params: StrategyParams;
  result: BacktestResult;
}

interface BacktestEventChannel {
  listeners: Set<(run: BacktestRunEvent) => void>;
  completed: boolean;
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
    channel = { listeners: new Set(), completed: false };
    channels.set(batchId, channel);
  }
  return channel;
}

export function subscribeBacktestEvents(
  batchId: string,
): ReadableStream<Uint8Array> {
  const channel = getChannel(batchId);
  const encoder = new TextEncoder();
  let listener: ((run: BacktestRunEvent) => void) | undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      listener = (run) => {
        controller.enqueue(
          encoder.encode(`event: result\ndata: ${JSON.stringify(run)}\n\n`),
        );
      };
      channel.listeners.add(listener);
    },
    cancel() {
      if (listener) channel.listeners.delete(listener);
      if (channel.listeners.size === 0) registry().delete(batchId);
    },
  });
}

export function publishBacktestResult(
  batchId: string,
  run: BacktestRunEvent,
): void {
  const channel = registry().get(batchId);
  channel?.listeners.forEach((listener) => listener(run));
}

export function completeBacktestEvents(batchId: string): void {
  const channels = registry();
  const channel = channels.get(batchId);
  if (!channel) return;
  channel.completed = true;
  if (channel.listeners.size === 0) channels.delete(batchId);
}
