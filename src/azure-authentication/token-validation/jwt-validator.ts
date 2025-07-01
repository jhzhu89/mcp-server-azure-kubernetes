import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import {
  type ParsedJwtToken,
  type JwtUserClaims,
  ParsedJwtToken as Token,
} from "./parsed-token.js";
import { AuthError, AUTH_ERROR_CODES } from "../errors.js";
import { jwtLogger } from "../logging.js";

export interface JwtConfig {
  clientId: string;
  tenantId: string;
  audience?: string;
  issuer?: string;
  clockTolerance: number;
  cacheMaxAge: number;
  jwksRequestsPerMinute: number;
}

export class JwtHandler {
  private readonly jwksClient: jwksClient.JwksClient;
  private readonly config: {
    clientId: string;
    tenantId: string;
    audience: string;
    issuer: string;
    clockTolerance: number;
  };

  constructor(config: JwtConfig) {
    this.config = {
      clientId: config.clientId,
      tenantId: config.tenantId,
      audience: config.audience ?? config.clientId,
      issuer: config.issuer ?? `https://sts.windows.net/${config.tenantId}/`,
      clockTolerance: config.clockTolerance,
    };

    this.jwksClient = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: config.cacheMaxAge,
      rateLimit: true,
      jwksRequestsPerMinute: config.jwksRequestsPerMinute,
    });
  }

  async validateToken(accessToken: string): Promise<ParsedJwtToken> {
    try {
      jwtLogger.debug({ tenantId: this.config.tenantId }, "Validating token");
      const payload = await this.verifyToken(accessToken);
      const claims = this.extractClaims(payload);
      jwtLogger.debug(
        {
          tenantId: claims.tenantId,
          userObjectId: claims.userObjectId,
          expiresAt: new Date(claims.expiresAt).toISOString(),
        },
        "Token validated",
      );
      return new Token(claims, accessToken);
    } catch (error) {
      jwtLogger.error(
        {
          tenantId: this.config.tenantId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Token validation failed",
      );
      throw new AuthError(
        AUTH_ERROR_CODES.jwt_validation_failed,
        `Token validation failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async isValid(accessToken: string): Promise<boolean> {
    try {
      await this.validateToken(accessToken);
      return true;
    } catch {
      return false;
    }
  }

  private verifyToken(accessToken: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const getKey = (header: any, callback: any) => {
        this.jwksClient.getSigningKey(header.kid, (err, key) => {
          callback(err, key?.getPublicKey());
        });
      };

      jwt.verify(
        accessToken,
        getKey,
        {
          audience: this.config.audience,
          issuer: this.config.issuer,
          algorithms: ["RS256"],
          clockTolerance: this.config.clockTolerance,
        },
        (err, decoded) => {
          if (err) return reject(err);

          const payload = decoded as any;
          if (payload.tid !== this.config.tenantId) {
            return reject(new Error("Invalid tenant"));
          }

          resolve(payload);
        },
      );
    });
  }

  private extractClaims(payload: any): JwtUserClaims {
    if (!payload.oid || !payload.tid || !payload.exp) {
      throw new Error("Missing required claims");
    }

    return {
      userObjectId: payload.oid,
      tenantId: payload.tid,
      expiresAt: payload.exp * 1000,
    };
  }
}
