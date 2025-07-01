import { type DelegatedAuthContext } from "../credential-management/auth-context.js";
import { type DelegatedCredentialProvider } from "../credential-management/credential-types.js";
import { type ClientFactory } from "./client-types.js";
import { type ClientManagerConfig } from "../configuration.js";
import { BaseClientManager } from "./base-manager.js";

export class DelegatedClientManager<
  TClient,
  TOptions = void,
> extends BaseClientManager<TClient, DelegatedAuthContext, TOptions> {
  constructor(
    delegatedProvider: DelegatedCredentialProvider,
    clientFactory: ClientFactory<TClient, TOptions>,
    config: ClientManagerConfig,
  ) {
    super(delegatedProvider, clientFactory, config);
  }

  protected getAuthMode(): string {
    return "delegated";
  }

  protected getCredentialCacheKeyComponents(
    context: DelegatedAuthContext,
  ): string[] {
    return [context.tenantId, context.userObjectId];
  }

  protected createClientCacheKey(
    context: DelegatedAuthContext,
    options?: TOptions,
  ): string {
    const parts = [
      this.config.cacheKeyPrefix,
      "delegated",
      context.tenantId,
      context.userObjectId,
    ];

    const fingerprint = this.clientFactory.getClientFingerprint?.(options);
    if (fingerprint) {
      parts.push(fingerprint);
    }

    return parts.join("::");
  }

  protected getLoggingContext(
    context: DelegatedAuthContext,
  ): Record<string, any> {
    return {
      tenantId: context.tenantId,
      userObjectId: context.userObjectId,
    };
  }
}
