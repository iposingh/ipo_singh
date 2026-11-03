/**
 * Share one in-flight promise per key so concurrent callers do not duplicate network work.
 * Callers that need cancellation should still use AbortSignal on the underlying fetch;
 * an aborted shared flight surfaces as cancelled to every waiter.
 */
export function shareFlight<T>(flights: Map<string, Promise<T>>, key: string, start: () => Promise<T>): Promise<T> {
  const existing = flights.get(key);
  if (existing) return existing;
  const pending = start();
  flights.set(key, pending);
  void pending.finally(() => {
    if (flights.get(key) === pending) flights.delete(key);
  });
  return pending;
}
