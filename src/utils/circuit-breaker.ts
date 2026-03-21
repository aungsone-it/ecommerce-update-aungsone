// ============================================
// CIRCUIT BREAKER PATTERN
// Prevents hammering a failing service
// ============================================

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private readonly threshold = 3, // Open circuit after 3 failures
    private readonly timeout = 30000, // Stay open for 30 seconds
    private readonly name = 'API'
  ) {}

  /**
   * Check if the circuit allows requests
   */
  canAttempt(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      // Check if timeout has passed
      const now = Date.now();
      if (now - this.lastFailureTime >= this.timeout) {
        console.log(`🔄 ${this.name} Circuit moving to HALF_OPEN state`);
        this.state = 'HALF_OPEN';
        return true;
      }
      
      console.warn(`⛔ ${this.name} Circuit is OPEN - blocking request (${Math.round((this.timeout - (now - this.lastFailureTime)) / 1000)}s remaining)`);
      return false;
    }

    // HALF_OPEN: Allow one request to test
    return true;
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      console.log(`✅ ${this.name} Circuit closing after successful test`);
    }
    this.failures = 0;
    this.state = 'CLOSED';
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      if (this.state !== 'OPEN') {
        console.error(`🚨 ${this.name} Circuit OPENED after ${this.failures} failures - will retry in ${this.timeout / 1000}s`);
      }
      this.state = 'OPEN';
    } else {
      console.warn(`⚠️ ${this.name} Circuit failure ${this.failures}/${this.threshold}`);
    }
  }

  /**
   * Get current state
   */
  getState(): string {
    return this.state;
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    console.log(`🔄 ${this.name} Circuit manually reset`);
  }
}

// Global circuit breakers for different endpoints
export const ordersCircuitBreaker = new CircuitBreaker(3, 30000, 'Orders API');
export const chatCircuitBreaker = new CircuitBreaker(5, 20000, 'Chat API');
export const badgeCircuitBreaker = new CircuitBreaker(3, 30000, 'Badge API');
