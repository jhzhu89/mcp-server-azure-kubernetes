import { configLogger } from "./logging.js";
import { type JwtConfig } from "./token-validation/jwt-validator.js";

export interface AzureAuthConfig {
  authMode: "application" | "delegated";
  azure: {
    clientId: string;
    clientSecret?: string;
    certificatePath?: string;
    certificatePassword?: string;
    tenantId: string;
  };
  jwt: {
    audience?: string;
    issuer?: string;
    clockTolerance: number;
    cacheMaxAge: number;
    jwksRequestsPerMinute: number;
  };
  cache: {
    cacheKeyPrefix: string;
    clientCacheSlidingTtl?: number;
    clientCacheMaxSize?: number;
    credentialCacheSlidingTtl?: number;
    credentialCacheMaxSize?: number;
    credentialCacheAbsoluteTTL?: number;
  };
}

export interface DelegatedAuthenticationConfig {
  clientId: string;
  clientSecret?: string;
  certificatePath?: string;
  certificatePassword?: string;
  tenantId: string;
}

export interface ClientManagerConfig {
  cacheKeyPrefix: string;
  clientCache: {
    slidingTtl?: number;
    maxSize?: number;
  };
  credentialCache: {
    slidingTtl?: number;
    maxSize?: number;
    absoluteTTL?: number;
  };
}

export function loadAzureAuthConfig(): AzureAuthConfig {
  configLogger.debug({}, "Loading Azure core config");

  const requiredEnvVars = ["AZURE_CLIENT_ID", "AZURE_TENANT_ID"];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Required environment variable ${envVar} is not set`);
    }
  }

  const authMode = process.env.AZURE_AUTH_MODE || "application";
  if (authMode !== "application" && authMode !== "delegated") {
    throw new Error(
      `AZURE_AUTH_MODE must be either 'application' or 'delegated', got: ${authMode}`,
    );
  }

  if (authMode === "delegated") {
    const hasSecret = !!process.env.AZURE_CLIENT_SECRET;
    const hasCertificate = !!process.env.AZURE_CLIENT_CERTIFICATE_PATH;

    if (!hasSecret && !hasCertificate) {
      throw new Error(
        "Either AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH must be set for delegated auth mode",
      );
    }

    if (hasSecret && hasCertificate) {
      throw new Error(
        "Only one of AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH should be set",
      );
    }
  }

  const nodeEnv = process.env.NODE_ENV || "development";

  configLogger.debug(
    {
      nodeEnv,
      authMode,
      authMethod:
        authMode === "delegated"
          ? process.env.AZURE_CLIENT_SECRET
            ? "secret"
            : "certificate"
          : "default",
      tenantId: process.env.AZURE_TENANT_ID,
    },
    "Config loaded",
  );

  return {
    authMode: authMode as "application" | "delegated",
    azure: {
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      certificatePath: process.env.AZURE_CLIENT_CERTIFICATE_PATH,
      certificatePassword: process.env.AZURE_CLIENT_CERTIFICATE_PASSWORD,
      tenantId: process.env.AZURE_TENANT_ID!,
    },
    jwt: {
      audience: process.env.JWT_AUDIENCE,
      issuer: process.env.JWT_ISSUER,
      clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE || "300"),
      cacheMaxAge: parseInt(process.env.JWT_CACHE_MAX_AGE || "86400000"),
      jwksRequestsPerMinute: parseInt(
        process.env.JWKS_REQUESTS_PER_MINUTE || "10",
      ),
    },
    cache: {
      cacheKeyPrefix: process.env.CACHE_KEY_PREFIX || "client",
      clientCacheSlidingTtl: process.env.CACHE_CLIENT_SLIDING_TTL
        ? parseInt(process.env.CACHE_CLIENT_SLIDING_TTL)
        : undefined,
      clientCacheMaxSize: process.env.CACHE_CLIENT_MAX_SIZE
        ? parseInt(process.env.CACHE_CLIENT_MAX_SIZE)
        : undefined,
      credentialCacheSlidingTtl: process.env.CACHE_CREDENTIAL_SLIDING_TTL
        ? parseInt(process.env.CACHE_CREDENTIAL_SLIDING_TTL)
        : undefined,
      credentialCacheMaxSize: process.env.CACHE_CREDENTIAL_MAX_SIZE
        ? parseInt(process.env.CACHE_CREDENTIAL_MAX_SIZE)
        : undefined,
      credentialCacheAbsoluteTTL: process.env.CACHE_CREDENTIAL_ABSOLUTE_TTL
        ? parseInt(process.env.CACHE_CREDENTIAL_ABSOLUTE_TTL)
        : undefined,
    },
  };
}

export function validateAzureAuthConfig(config: AzureAuthConfig): void {
  if (!config.azure.clientId || !config.azure.tenantId) {
    throw new Error("Azure configuration is incomplete");
  }

  if (
    !config.authMode ||
    (config.authMode !== "application" && config.authMode !== "delegated")
  ) {
    throw new Error("authMode must be either 'application' or 'delegated'");
  }

  if (config.authMode === "delegated") {
    const hasSecret = !!config.azure.clientSecret;
    const hasCertificate = !!config.azure.certificatePath;

    if (!hasSecret && !hasCertificate) {
      throw new Error(
        "Either clientSecret or certificatePath must be provided for delegated auth mode",
      );
    }

    if (hasSecret && hasCertificate) {
      throw new Error(
        "Only one of clientSecret or certificatePath should be provided",
      );
    }
  }

  if (
    config.jwt.clockTolerance < 0 ||
    config.jwt.cacheMaxAge <= 0 ||
    config.jwt.jwksRequestsPerMinute <= 0
  ) {
    throw new Error("JWT configuration must have valid values");
  }
}

let cachedConfig: AzureAuthConfig | null = null;

export function getAzureAuthConfig(): AzureAuthConfig {
  if (!cachedConfig) {
    cachedConfig = loadAzureAuthConfig();
    validateAzureAuthConfig(cachedConfig);
  }
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}

export function getDelegatedCredentialConfig(): DelegatedAuthenticationConfig {
  const config = getAzureAuthConfig();

  if (config.authMode !== "delegated") {
    throw new Error(
      `Expected delegated auth mode, but got: ${config.authMode}`,
    );
  }

  return {
    clientId: config.azure.clientId,
    clientSecret: config.azure.clientSecret,
    certificatePath: config.azure.certificatePath,
    certificatePassword: config.azure.certificatePassword,
    tenantId: config.azure.tenantId,
  };
}

export function getJwtConfig(): JwtConfig {
  const config = getAzureAuthConfig();

  if (config.authMode !== "delegated") {
    throw new Error(
      `JWT configuration is only available for delegated auth mode, but got: ${config.authMode}`,
    );
  }

  return {
    clientId: config.azure.clientId,
    tenantId: config.azure.tenantId,
    audience: config.jwt.audience,
    issuer: config.jwt.issuer,
    clockTolerance: config.jwt.clockTolerance,
    cacheMaxAge: config.jwt.cacheMaxAge,
    jwksRequestsPerMinute: config.jwt.jwksRequestsPerMinute,
  };
}

export function getDelegatedClientManagerConfig(): ClientManagerConfig {
  const config = getAzureAuthConfig();

  if (config.authMode !== "delegated") {
    throw new Error(
      `Delegated client manager configuration is only available for delegated auth mode, but got: ${config.authMode}`,
    );
  }

  return {
    cacheKeyPrefix: config.cache.cacheKeyPrefix,
    clientCache: {
      slidingTtl: config.cache.clientCacheSlidingTtl ?? 45 * 60 * 1000,
      maxSize: config.cache.clientCacheMaxSize ?? 100,
    },
    credentialCache: {
      slidingTtl: config.cache.credentialCacheSlidingTtl ?? 2 * 60 * 60 * 1000,
      maxSize: config.cache.credentialCacheMaxSize ?? 200,
      absoluteTTL:
        config.cache.credentialCacheAbsoluteTTL ?? 8 * 60 * 60 * 1000,
    },
  };
}

export function getApplicationClientManagerConfig(): ClientManagerConfig {
  const config = getAzureAuthConfig();

  if (config.authMode !== "application") {
    throw new Error(
      `Application client manager configuration is only available for application auth mode, but got: ${config.authMode}`,
    );
  }

  return {
    cacheKeyPrefix: config.cache.cacheKeyPrefix,
    clientCache: {
      slidingTtl: config.cache.clientCacheSlidingTtl ?? 2 * 60 * 60 * 1000,
      maxSize: config.cache.clientCacheMaxSize ?? 50,
    },
    credentialCache: {
      slidingTtl: config.cache.credentialCacheSlidingTtl ?? 4 * 60 * 60 * 1000,
      maxSize: config.cache.credentialCacheMaxSize ?? 10,
      absoluteTTL:
        config.cache.credentialCacheAbsoluteTTL ?? 12 * 60 * 60 * 1000,
    },
  };
}
