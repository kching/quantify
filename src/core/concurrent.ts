export async function forEachConcurrent<T>(
  items: readonly T[],
  maxConcurrent: number,
  run: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1)
    throw new Error("Concurrency must be a positive integer.");

  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await run(items[index]!, index);
    }
  };
  const workers = Array.from(
    { length: Math.min(maxConcurrent, items.length) },
    () => worker(),
  );
  const outcomes = await Promise.allSettled(workers);
  const failed = outcomes.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  if (failed) throw failed.reason;
}
