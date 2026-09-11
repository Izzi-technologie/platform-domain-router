export type ResolveWinner = {
  saasId: string;
  upstreamUrl: string;
};

export type CacheEntry =
  | { kind: "hit"; winner: ResolveWinner; expiresAt: number }
  | { kind: "miss"; expiresAt: number };

export type CacheStats = {
  hits: number;
  misses: number;
  negativeHits: number;
  sets: number;
};

export class ResolveCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly stats: CacheStats = {
    hits: 0,
    misses: 0,
    negativeHits: 0,
    sets: 0,
  };
  private readonly positiveTtlMs: number;
  private readonly negativeTtlMs: number;

  constructor(positiveTtlMs: number, negativeTtlMs: number) {
    this.positiveTtlMs = positiveTtlMs;
    this.negativeTtlMs = negativeTtlMs;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  lookup(host: string): ResolveWinner | null | undefined {
    const key = normalizeHostKey(host);
    const entry = this.entries.get(key);
    if (!entry) {
      this.stats.misses += 1;
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      this.stats.misses += 1;
      return undefined;
    }

    if (entry.kind === "hit") {
      this.stats.hits += 1;
      return entry.winner;
    }

    this.stats.negativeHits += 1;
    return null;
  }

  setPositive(host: string, winner: ResolveWinner): void {
    const key = normalizeHostKey(host);
    this.entries.set(key, {
      kind: "hit",
      winner,
      expiresAt: Date.now() + this.positiveTtlMs,
    });
    this.stats.sets += 1;
  }

  setNegative(host: string): void {
    const key = normalizeHostKey(host);
    this.entries.set(key, {
      kind: "miss",
      expiresAt: Date.now() + this.negativeTtlMs,
    });
    this.stats.sets += 1;
  }

  clear(): void {
    this.entries.clear();
  }
}

export function normalizeHostKey(host: string): string {
  return host.trim().toLowerCase().split(":")[0] ?? "";
}
