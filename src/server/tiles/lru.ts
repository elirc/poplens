/**
 * Tiny in-process LRU cache with optional TTL (pure; unit-tested).
 * Map preserves insertion order, so the first key is the least recently used;
 * `get` re-inserts to mark recency. Used for MVT tiles and GeoJSON payloads.
 */
export class LruCache<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    readonly maxEntries: number,
    readonly ttlMs: number = Infinity,
    private readonly now: () => number = Date.now,
  ) {
    if (maxEntries < 1) throw new Error("LruCache maxEntries must be >= 1");
  }

  get size(): number {
    return this.map.size;
  }

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}
