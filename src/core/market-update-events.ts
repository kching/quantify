export interface MarketUpdateEvent {
  completedAt: number;
}

type MarketUpdateListener = (event: MarketUpdateEvent) => void;

interface MarketUpdateGlobal {
  quantifyMarketUpdateListeners?: Set<MarketUpdateListener>;
}

const marketUpdateGlobal = globalThis as typeof globalThis & MarketUpdateGlobal;
const listeners = marketUpdateGlobal.quantifyMarketUpdateListeners ??= new Set<MarketUpdateListener>();

export function subscribeToMarketUpdates(listener: MarketUpdateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishMarketUpdate(event: MarketUpdateEvent): void {
  for (const listener of listeners) listener(event);
}
