export class SingleFlightQueue<TResult> {
  private tail: Promise<void> = Promise.resolve();
  private readonly inFlight = new Map<string, Promise<TResult>>();

  run(key: string, operation: () => Promise<TResult>): Promise<TResult> {
    if (!key) throw new Error('Single-flight operations require a non-empty key.');
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const pending = this.tail.then(operation);
    this.inFlight.set(key, pending);
    this.tail = pending.then(() => undefined, () => undefined);
    void pending.finally(() => {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }).catch(() => undefined);
    return pending;
  }

  has(key: string): boolean {
    return this.inFlight.has(key);
  }

  clear(): void {
    this.inFlight.clear();
  }
}
