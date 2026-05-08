export interface StoredToken {
    /** The raw hub-callback token string. Forwarded as `Authorization: Bearer <token>`. */
    token: string;
    /**
     * Epoch milliseconds at which the token expires. Variable — clamped by the
     * hub to the user's `originalLoginExp` (Stance 4 cap). Can be anywhere from
     * a few seconds to 8h from issuance. Always trust this value over a hardcoded
     * "+8h" assumption. See `docs/broadcast-stance4-stabilization.md`.
     */
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
export declare class InMemoryTokenStore implements TokenStore {
    private store;
    get(userId: number): Promise<StoredToken | null>;
    set(userId: number, token: StoredToken): Promise<void>;
    delete(userId: number): Promise<void>;
    /** Test helper — clears all stored tokens. Not part of the TokenStore interface. */
    clear(): void;
}
