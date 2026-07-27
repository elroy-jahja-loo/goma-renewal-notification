import { Injectable } from '@nestjs/common';

@Injectable()
export class RateLimiterService {
  private maxTokens = 20;
  private currentTokens = 20;
  private refillRate = 20 / 1000;
  private lastRefill = Date.now();

  tryConsume(): boolean {
    this.refill();

    if (this.currentTokens >= 1) {
      this.currentTokens -= 1;
      return true;
    }

    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.currentTokens = Math.min(
      this.maxTokens,
      this.currentTokens + tokensToAdd,
    );
    this.lastRefill = now;
  }
}
