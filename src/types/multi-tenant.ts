export interface UserContext {
  userObjectId: string;
  tenantId: string;
  accessToken: string;
}

export interface ResourceId {
  subscriptionId: string;
  resourceGroup: string;
  clusterName: string;
}

export interface CachedToken {
  token: string;
  expiresAt: number;
  refreshToken?: string;
}

export interface CachedUserInfo {
  userObjectId: string;
  tenantId: string;
  objectId: string;
  expiresAt: number;
}

export interface MultiTenantConfig {
  azure: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    scope: string[];
  };
  cache: {
    tokenTtlMinutes: number;
    maxCacheSize: number;
    safetyBufferMinutes: number;
  };
  security: {
    allowedSubscriptions?: string[];
    auditLogEnabled: boolean;
    maxKubeconfigAge: number;
  };
}

export interface KubectlParams {
  subscription: string;
  resourceGroup: string;
  clusterName: string;
  _toolName?: string;
  [key: string]: any;
}

export interface TokenCacheKeyFormats {
  armToken: string;
  aksToken: string;
  userInfo: string;
}
