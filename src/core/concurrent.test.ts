import { describe, expect, it } from "bun:test";
import { forEachConcurrent } from "./concurrent";

describe("forEachConcurrent", () => {
  it("runs no more than the configured number of tasks at once", async () => {
    let active = 0;
    let maximumActive = 0;

    await forEachConcurrent(
      Array.from({ length: 12 }, (_, index) => index),
      5,
      async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        active -= 1;
      },
    );

    expect(maximumActive).toBe(5);
    expect(active).toBe(0);
  });
});
