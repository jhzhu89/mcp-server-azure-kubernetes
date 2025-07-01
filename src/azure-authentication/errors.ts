export const AUTH_ERROR_CODES = {
  jwt_validation_failed: "jwt_validation_failed",
  token_exchange_failed: "token_exchange_failed",
  invalid_access_token: "invalid_access_token",
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export class AuthError extends Error {
  public readonly timestamp: Date;

  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AuthError";
    this.timestamp = new Date();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
}
