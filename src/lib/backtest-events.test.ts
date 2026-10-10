import { describe, expect, it } from "bun:test";
import {
  completeBacktestEvents,
  publishBacktestResult,
  subscribeBacktestEvents,
} from "./backtest-events";

const runEvent = (runIndex: number) => ({
  runIndex,
  params: { fastPeriod: runIndex + 5 },
  result: {
    symbol: "MQG.AX",
    strategyId: "klinger-oscillator",
    initialBalance: 10_000,
    finalBalance: 10_500,
    strategyReturnPct: 5,
    buyAndHoldReturnPct: 2,
    totalReturnPct: 3,
    winRatePct: 50,
    maxDrawdownPct: 1,
    trades: [],
  },
});

describe("backtest event stream", () => {
  it("replays only events after the last received event id when reconnecting", async () => {
    const batchId = `replay-test-${crypto.randomUUID()}`;
    const firstReader = subscribeBacktestEvents(batchId).getReader();
    publishBacktestResult(batchId, runEvent(0));
    publishBacktestResult(batchId, runEvent(1));
    const firstChunk = await firstReader.read();
    expect(new TextDecoder().decode(firstChunk.value)).toContain(
      "id: 1\nevent: result",
    );
    const secondChunk = await firstReader.read();
    expect(new TextDecoder().decode(secondChunk.value)).toContain(
      "id: 2\nevent: result",
    );
    await firstReader.cancel();

    const reconnectedReader = subscribeBacktestEvents(batchId, 1).getReader();
    const replayedChunk = await reconnectedReader.read();
    const replayedEvent = new TextDecoder().decode(replayedChunk.value);
    expect(replayedEvent).toContain("id: 2\nevent: result");
    expect(replayedEvent).toContain('"runIndex":1');

    completeBacktestEvents(batchId);
    await reconnectedReader.cancel();
  });
});
