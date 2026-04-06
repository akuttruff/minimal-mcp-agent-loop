export class RateLimiter {
  private readonly maxCalls: number;
  private readonly windowMs: number;
  private timestamps: number[] = [];

  constructor(maxCalls: number, windowSeconds: number) {
    this.maxCalls = maxCalls;
    this.windowMs = windowSeconds * 1_000;
  }

  private evict(): void {
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }

  check(): boolean {
    this.evict();
    return this.timestamps.length < this.maxCalls;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }

  waitTime(): number {
    this.evict();
    if (this.timestamps.length < this.maxCalls) return 0;
    const oldest = this.timestamps[0];
    if (oldest === undefined) return 0;
    return oldest + this.windowMs - Date.now();
  }
}
