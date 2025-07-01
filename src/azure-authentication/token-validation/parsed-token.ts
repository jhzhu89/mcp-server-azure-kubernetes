export interface JwtUserClaims {
  userObjectId: string;
  tenantId: string;
  expiresAt: number;
}

export class ParsedJwtToken {
  constructor(
    public readonly claims: JwtUserClaims,
    public readonly rawToken: string,
  ) {}

  get userObjectId(): string {
    return this.claims.userObjectId;
  }
  get tenantId(): string {
    return this.claims.tenantId;
  }
  get expiresAt(): number {
    return this.claims.expiresAt;
  }
}
