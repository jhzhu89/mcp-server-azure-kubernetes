import jwt from "jsonwebtoken";
import { LRUCache } from "lru-cache";
import { buildCacheKey } from "../constants/naming.js";
import { MultiTenantError, MultiTenantErrorCode } from "../types/errors.js";
import {
  CachedToken,
  CachedUserInfo,
  MultiTenantConfig,
  UserContext,
} from "../types/multi-tenant.js";
import { TokenManagerBase } from "./token-manager-base.js";

export class AzureAuthManager extends TokenManagerBase {
  private tokenCache: LRUCache<string, CachedToken>;
  private activeRequests: Map<
    string,
    Promise<{ token: string; expiresAt: number }>
  > = new Map();

  constructor(config: MultiTenantConfig) {
    super(config);

    this.tokenCache = new LRUCache<string, CachedToken>({
      max: config.cache.maxCacheSize,
      ttl: config.cache.tokenTtlMinutes * 60 * 1000,
    });
  }

  async getArmToken(
    userContext: UserContext,
  ): Promise<{ token: string; expiresAt: number }> {
    const cacheKey = buildCacheKey(
      "arm",
      userContext.tenantId,
      userContext.userObjectId,
    );

    const cached = this.tokenCache.get(cacheKey);
    const bufferMs = this.config.cache.safetyBufferMinutes * 60 * 1000;
    if (cached && cached.expiresAt > Date.now() + bufferMs) {
      return {
        token: cached.token,
        expiresAt: cached.expiresAt,
      };
    }

    let activeRequest = this.activeRequests.get(cacheKey);
    if (!activeRequest) {
      activeRequest = this.executeTokenAcquisition(userContext);
      this.activeRequests.set(cacheKey, activeRequest);
    }

    try {
      const result = await activeRequest;
      this.tokenCache.set(cacheKey, {
        token: result.token,
        expiresAt: result.expiresAt,
      });
      return result;
    } finally {
      this.activeRequests.delete(cacheKey);
    }
  }

  private async executeTokenAcquisition(
    userContext: UserContext,
  ): Promise<{ token: string; expiresAt: number }> {
    try {
      const tokenResult = await this.performOboFlow(
        userContext.accessToken,
        "https://management.azure.com/.default",
        userContext.tenantId,
      );

      return {
        token: tokenResult.accessToken,
        expiresAt: tokenResult.expiresAt,
      };
    } catch (error) {
      throw new MultiTenantError(
        MultiTenantErrorCode.TOKEN_ACQUISITION_FAILED,
        `Failed to acquire ARM token: ${error}`,
        userContext.userObjectId,
        userContext.tenantId,
      );
    }
  }

  async extractUserInfo(accessToken: string): Promise<CachedUserInfo> {
    try {
      const decoded = jwt.decode(accessToken) as any;

      if (!decoded || !decoded.oid || !decoded.tid) {
        throw new Error("Invalid JWT token structure");
      }

      if (!decoded.exp || decoded.exp * 1000 <= Date.now()) {
        throw new Error("JWT token has expired");
      }

      return {
        userObjectId: decoded.oid,
        tenantId: decoded.tid,
        objectId: decoded.oid,
        expiresAt: decoded.exp * 1000,
      };
    } catch (error) {
      throw new MultiTenantError(
        MultiTenantErrorCode.JWT_VALIDATION_FAILED,
        `Failed to extract user info from JWT: ${error}`,
      );
    }
  }

  async validateJwtToken(accessToken: string): Promise<boolean> {
    try {
      const userInfo = await this.extractUserInfo(accessToken);
      return userInfo.expiresAt > Date.now();
    } catch (error) {
      return false;
    }
  }

  async validateTenantAccess(
    userContext: UserContext,
    subscription: string,
  ): Promise<boolean> {
    // TODO: Implement proper tenant validation
    // Should check if subscription belongs to user's tenant via ARM API
    // Reference: Python implementation in InjectUserIdAndValidateRid
    return true;
  }

  async createUserContext(
    accessToken: string,
    subscription?: string,
  ): Promise<UserContext> {
    const isValid = await this.validateJwtToken(accessToken);
    if (!isValid) {
      throw new MultiTenantError(
        MultiTenantErrorCode.JWT_VALIDATION_FAILED,
        "Invalid or expired JWT token",
      );
    }

    const userInfo = await this.extractUserInfo(accessToken);

    const userContext: UserContext = {
      userObjectId: userInfo.userObjectId,
      tenantId: userInfo.tenantId,
      accessToken,
    };

    if (subscription) {
      const isValid = await this.validateTenantAccess(
        userContext,
        subscription,
      );
      if (!isValid) {
        throw new MultiTenantError(
          MultiTenantErrorCode.TENANT_BOUNDARY_VIOLATION,
          "Access denied to the specified subscription",
          userContext.userObjectId,
          userContext.tenantId,
        );
      }
    }

    return userContext;
  }
}
