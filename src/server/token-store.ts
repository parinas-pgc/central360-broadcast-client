// Token storage interface — satellites pick the implementation that matches their
// deploy frequency (spec Part VII §17 F6 storage options):
//   - InMemoryTokenStore: tokens lost on restart. Each user re-issues on next call.
//     Reasonable Phase-1 starting point per the spec.
//   - DB-backed impl (write-your-own): survives restarts. Recommended once non-trivial
//     deploy frequency emerges. The hub does not care which option a satellite picks.

export interface StoredToken {
  /** The raw hub-callback token string. Forwarded as `Authorization: Bearer <token>`. */
  token: string;
  /** Epoch milliseconds at which the token expires. */
  expiresAt: number;
}

export interface TokenStore {
  get(userId: number): Promise<StoredToken | null>;
  set(userId: number, token: StoredToken): Promise<void>;
  delete(userId: number): Promise<void>;
}

/**
 * Process-local in-memory token store. Tokens are lost on satellite restart, in
 * which case the next call from that user issues a fresh token via the redirect
 * token (which the satellite captured at launch). Suitable for low-deploy-frequency
 * satellites or as a starter before wiring DB persistence.
 */
export class InMemoryTokenStore implements TokenStore {
  private store = new Map<number, StoredToken>();

  async get(userId: number): Promise<StoredToken | null> {
    return this.store.get(userId) ?? null;
  }

  async set(userId: number, token: StoredToken): Promise<void> {
    this.store.set(userId, token);
  }

  async delete(userId: number): Promise<void> {
    this.store.delete(userId);
  }

  /** Test helper — clears all stored tokens. Not part of the TokenStore interface. */
  clear(): void {
    this.store.clear();
  }
}
