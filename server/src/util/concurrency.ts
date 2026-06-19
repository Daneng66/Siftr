/**
 * Minimal concurrency limiter (avoids pulling in ESM-only p-limit). Runs at most
 * `limit` async tasks at once.
 */
export function createLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= limit) return;
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      queue.push(start);
      next();
    });
  };
}

/** Run an async mapper over items with bounded concurrency. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const run = createLimiter(limit);
  return Promise.all(items.map((item, i) => run(() => mapper(item, i))));
}
