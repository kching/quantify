import { describe, expect, it } from 'bun:test';
import { publishMarketUpdate, subscribeToMarketUpdates } from './market-update-events';

describe('market update events', () => {
  it('notifies subscribers and allows them to unsubscribe', () => {
    const events: number[] = [];
    const unsubscribe = subscribeToMarketUpdates(({ completedAt }) => events.push(completedAt));

    publishMarketUpdate({ completedAt: 123 });
    unsubscribe();
    publishMarketUpdate({ completedAt: 456 });

    expect(events).toEqual([123]);
  });
});
