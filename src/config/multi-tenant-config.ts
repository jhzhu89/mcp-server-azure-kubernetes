import { MultiTenantConfig } from "../types/multi-tenant.js";

export function loadMultiTenantConfig(): MultiTenantConfig {
  const requiredEnvVars = [
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "AZURE_TENANT_ID",
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Required environment variable ${envVar} is not set`);
    }
  }

  return {
    azure: {
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      tenantId: process.env.AZURE_TENANT_ID!,
      scope: ["https://management.azure.com/.default"],
    },
    cache: {
      tokenTtlMinutes: parseInt(process.env.CACHE_TOKEN_TTL_MINUTES || "60"),
      maxCacheSize: parseInt(process.env.CACHE_MAX_SIZE || "1000"),
      safetyBufferMinutes: parseInt(
        process.env.CACHE_SAFETY_BUFFER_MINUTES || "1"
      ),
    },
    security: {
      allowedSubscriptions: process.env.ALLOWED_SUBSCRIPTIONS?.split(","),
      auditLogEnabled: process.env.AUDIT_LOG_ENABLED === "true",
      maxKubeconfigAge: parseInt(
        process.env.MAX_KUBECONFIG_AGE_MINUTES || "30"
      ),
    },
  };
}

export function validateMultiTenantConfig(config: MultiTenantConfig): void {
  if (
    !config.azure.clientId ||
    !config.azure.clientSecret ||
    !config.azure.tenantId
  ) {
    throw new Error("Azure configuration is incomplete");
  }

  if (
    config.cache.tokenTtlMinutes <= 0 ||
    config.cache.maxCacheSize <= 0 ||
    config.cache.safetyBufferMinutes < 0
  ) {
    throw new Error("Cache configuration must have positive values");
  }

  if (config.security.maxKubeconfigAge <= 0) {
    throw new Error("Max kubeconfig age must be positive");
  }
}
