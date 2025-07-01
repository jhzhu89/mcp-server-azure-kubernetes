import { ParsedJwtToken } from "../token-validation/parsed-token.js";

export class DelegatedAuthContext {
  readonly mode = "delegated" as const;

  constructor(public readonly parsedToken: ParsedJwtToken) {}

  get tenantId(): string {
    return this.parsedToken.tenantId;
  }
  get userObjectId(): string {
    return this.parsedToken.userObjectId;
  }
  get accessToken(): string {
    return this.parsedToken.rawToken;
  }
  get expiresAt(): number {
    return this.parsedToken.expiresAt;
  }
}

export class ApplicationAuthContext {
  readonly mode = "application" as const;
}
