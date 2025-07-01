import TTLCache from "@isaacs/ttlcache";
import { createHash } from "crypto";
import { type TokenCredential } from "@azure/identity";
import { type ClientFactory } from "./client-types.js";
import { type ClientManagerConfig } from "../configuration.js";
import { type CredentialProvider } from "../credential-management/credential-types.js";
import { clientLogger, credentialLogger } from "../logging.js";

const CACHE_KEY_TRUNCATE_LENGTH = 50;

interface CredentialCacheEntry {
  credential: TokenCredential;
  absoluteExpiresAt: number;
}

interface ClientCacheEntry<TClient> {
  client: TClient;
}

function createStableCacheKey(rawKey: string): string {
  return createHash("md5").update(rawKey, "utf8").digest("base64url");
}

function createLoggableKey(rawKey: string): string {
  return rawKey.length > CACHE_KEY_TRUNCATE_LENGTH
    ? rawKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
    : rawKey;
}

function hasDispose(obj: any): boolean {
  return (
    obj &&
    (typeof obj[Symbol.asyncDispose] === "function" ||
      typeof obj[Symbol.dispose] === "function" ||
      typeof obj.dispose === "function")
  );
}

export abstract class BaseClientManager<TClient, TContext, TOptions = void> {
  protected clientCache: TTLCache<string, ClientCacheEntry<TClient>>;
  protected credentialCache: TTLCache<string, CredentialCacheEntry>;
  protected pendingRequests: Map<string, Promise<TClient>>;
  protected pendingCredentials: Map<string, Promise<TokenCredential>>;

  constructor(
    private provider: CredentialProvider<TContext>,
    protected clientFactory: ClientFactory<TClient, TOptions>,
    protected config: ClientManagerConfig,
  ) {
    this.pendingRequests = new Map();
    this.pendingCredentials = new Map();

    this.credentialCache = new TTLCache<string, CredentialCacheEntry>({
      max: this.config.credentialCache.maxSize!,
      ttl: this.config.credentialCache.slidingTtl!,
      updateAgeOnGet: true,
      checkAgeOnGet: true,
    });

    this.clientCache = new TTLCache<string, ClientCacheEntry<TClient>>({
      max: this.config.clientCache.maxSize!,
      ttl: this.config.clientCache.slidingTtl!,
      updateAgeOnGet: true,
      checkAgeOnGet: true,
      dispose: (value: ClientCacheEntry<TClient>, key: string, reason: any) => {
        this.disposeClientEntry(value, key, reason).catch((error: any) => {
          clientLogger.error(
            {
              authMode: this.getAuthMode(),
              cacheKey:
                key.length > CACHE_KEY_TRUNCATE_LENGTH
                  ? key.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
                  : key,
              error: error instanceof Error ? error.message : String(error),
              reason,
            },
            "Error disposing client",
          );
        });
      },
    });

    clientLogger.debug(
      {
        clientCacheMaxSize: this.config.clientCache.maxSize,
        clientCacheTTL: this.config.clientCache.slidingTtl,
        credentialCacheMaxSize: this.config.credentialCache.maxSize,
        credentialCacheTTL: this.config.credentialCache.slidingTtl,
        credentialAbsoluteTTL: this.config.credentialCache.absoluteTTL,
        authMode: this.getAuthMode(),
      },
      `${this.getAuthMode()} client manager initialized`,
    );
  }

  private async disposeClientEntry(
    entry: ClientCacheEntry<TClient>,
    cacheKey: string,
    reason: string,
  ): Promise<void> {
    if (!hasDispose(entry.client)) {
      return;
    }

    try {
      clientLogger.debug(
        {
          authMode: this.getAuthMode(),
          cacheKey:
            cacheKey.length > CACHE_KEY_TRUNCATE_LENGTH
              ? cacheKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
              : cacheKey,
          reason,
          clientType: (entry.client as any).constructor?.name || "Unknown",
        },
        "Disposing client",
      );

      const client = entry.client as any;
      if (client[Symbol.asyncDispose]) {
        await client[Symbol.asyncDispose]();
      } else if (client[Symbol.dispose]) {
        client[Symbol.dispose]();
      } else if (client.dispose) {
        await client.dispose();
      }

      clientLogger.debug(
        {
          authMode: this.getAuthMode(),
          cacheKey:
            cacheKey.length > CACHE_KEY_TRUNCATE_LENGTH
              ? cacheKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
              : cacheKey,
          reason,
        },
        "Client disposed successfully",
      );
    } catch (error) {
      clientLogger.warn(
        {
          authMode: this.getAuthMode(),
          cacheKey:
            cacheKey.length > CACHE_KEY_TRUNCATE_LENGTH
              ? cacheKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
              : cacheKey,
          error: error instanceof Error ? error.message : String(error),
          reason,
        },
        "Client dispose failed, continuing cleanup",
      );
    }
  }

  protected createCredentialCacheKey(context: TContext): string {
    const parts = [
      this.config.cacheKeyPrefix,
      this.getAuthMode(),
      ...this.getCredentialCacheKeyComponents(context),
    ];
    return parts.join("::");
  }

  protected async getOrCreateCredential(
    context: TContext,
  ): Promise<TokenCredential> {
    const credKey = this.createCredentialCacheKey(context);

    const cached = this.credentialCache.get(credKey);
    if (cached && cached.absoluteExpiresAt > Date.now()) {
      credentialLogger.debug(
        {
          authMode: this.getAuthMode(),
          ...this.getLoggingContext(context),
          cacheKey:
            credKey.length > CACHE_KEY_TRUNCATE_LENGTH
              ? credKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
              : credKey,
        },
        "Credential cache hit",
      );
      return cached.credential;
    }

    const existingPromise = this.pendingCredentials.get(credKey);
    if (existingPromise) {
      credentialLogger.debug(
        {
          authMode: this.getAuthMode(),
          ...this.getLoggingContext(context),
        },
        "Found pending credential request",
      );
      return existingPromise;
    }

    credentialLogger.debug(
      {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
      },
      "Credential cache miss, creating new credential",
    );

    const promise = this.createCredentialInternal(context, credKey);
    this.pendingCredentials.set(credKey, promise);

    try {
      return await promise;
    } finally {
      this.pendingCredentials.delete(credKey);
    }
  }

  private async createCredentialInternal(
    context: TContext,
    credKey: string,
  ): Promise<TokenCredential> {
    const credential = await this.provider.createCredential(context);

    const entry: CredentialCacheEntry = {
      credential,
      absoluteExpiresAt: Date.now() + this.config.credentialCache.absoluteTTL!,
    };

    this.credentialCache.set(credKey, entry);

    credentialLogger.debug(
      {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
        slidingTTL: this.config.credentialCache.slidingTtl,
        expiresAt: new Date(entry.absoluteExpiresAt).toISOString(),
        credentialCacheSize: this.credentialCache.size,
      },
      "Credential created and cached",
    );

    return credential;
  }

  async getClient(context: TContext, options?: TOptions): Promise<TClient> {
    const rawKey = this.createClientCacheKey(context, options);
    const stableKey = createStableCacheKey(rawKey);

    clientLogger.debug(
      {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
        cacheKey: createLoggableKey(rawKey),
      },
      "Cache lookup",
    );

    const cached = this.clientCache.get(stableKey)?.client;
    if (cached) {
      clientLogger.debug(
        {
          authMode: this.getAuthMode(),
          ...this.getLoggingContext(context),
          cacheSize: this.clientCache.size,
        },
        "Cache hit",
      );
      return cached;
    }

    const existingPromise = this.pendingRequests.get(stableKey);
    if (existingPromise) {
      clientLogger.debug(
        {
          authMode: this.getAuthMode(),
          ...this.getLoggingContext(context),
        },
        "Found pending request",
      );
      return existingPromise;
    }

    clientLogger.debug(
      {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
      },
      "Cache miss, creating new client",
    );

    const promise = this.createClientInternal(context, options, stableKey);
    this.pendingRequests.set(stableKey, promise);

    try {
      return await promise;
    } finally {
      this.pendingRequests.delete(stableKey);
    }
  }

  protected async createClientInternal(
    context: TContext,
    options: TOptions | undefined,
    cacheKey: string,
  ): Promise<TClient> {
    const credential = await this.getOrCreateCredential(context);
    const client = await this.clientFactory.createClient(credential, options);

    const entry: ClientCacheEntry<TClient> = {
      client,
    };

    this.clientCache.set(cacheKey, entry);

    clientLogger.debug(
      {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
        slidingTTL: this.config.clientCache.slidingTtl,
        cacheSize: this.clientCache.size,
      },
      "Client created and cached",
    );

    return client;
  }

  clearCache(): void {
    this.clientCache.clear();
    this.credentialCache.clear();
    clientLogger.debug({ authMode: this.getAuthMode() }, "All caches cleared");
  }

  clearCredentialCache(): void {
    this.credentialCache.clear();
    credentialLogger.debug(
      { authMode: this.getAuthMode() },
      "Credential cache cleared",
    );
  }

  removeCachedClientByContext(context: TContext, options?: TOptions): boolean {
    const rawKey = this.createClientCacheKey(context, options);
    const stableKey = createStableCacheKey(rawKey);

    const deleted = this.clientCache.delete(stableKey);

    clientLogger.debug(
      {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
        cacheKey: createLoggableKey(rawKey),
        deleted,
        cacheSize: this.clientCache.size,
      },
      "Cache entry removed by context",
    );
    return deleted;
  }

  getCacheStats() {
    return {
      clientCache: {
        size: this.clientCache.size,
        maxSize: this.clientCache.max,
        pendingRequests: this.pendingRequests.size,
      },
      credentialCache: {
        size: this.credentialCache.size,
        maxSize: this.credentialCache.max,
        pendingRequests: this.pendingCredentials.size,
      },
    };
  }

  protected abstract getCredentialCacheKeyComponents(
    context: TContext,
  ): string[];
  protected abstract getAuthMode(): string;
  protected abstract createClientCacheKey(
    context: TContext,
    options?: TOptions,
  ): string;
  protected abstract getLoggingContext(context: TContext): Record<string, any>;
}
