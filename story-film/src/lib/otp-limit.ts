// Caps how many sign-in codes one phone number or email address gets, whatever IP asks.
// The per-IP limits in auth-config.ts don't stop someone rotating IPs to flood one inbox,
// or pumping SMS to one premium number. In memory per server, like Better Auth's limiter.
export class RecipientLimiter {
  private readonly sends = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  // Records a send and says whether it is allowed.
  take(recipient: string): boolean {
    const t = this.now();
    const recent = (this.sends.get(recipient) ?? []).filter((at) => t - at < this.windowMs);
    if (recent.length >= this.max) {
      this.sends.set(recipient, recent);
      return false;
    }
    recent.push(t);
    this.sends.set(recipient, recent);
    if (this.sends.size > 10_000) this.prune(t);
    return true;
  }

  private prune(t: number) {
    for (const [k, v] of this.sends) if (v.every((at) => t - at >= this.windowMs)) this.sends.delete(k);
  }
}
