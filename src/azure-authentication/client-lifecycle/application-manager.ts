import { ApplicationAuthContext } from "../credential-management/auth-context.js";
import { type ApplicationCredentialProvider } from "../credential-management/credential-types.js";
import { type ClientFactory } from "./client-types.js";
import { type ClientManagerConfig } from "../configuration.js";
import { BaseClientManager } from "./base-manager.js";

export class ApplicationClientManager<
  TClient,
  TOptions = void,
> extends BaseClientManager<TClient, ApplicationAuthContext, TOptions> {
  constructor(
    applicationProvider: ApplicationCredentialProvider,
    clientFactory: ClientFactory<TClient, TOptions>,
    config: ClientManagerConfig,
  ) {
    super(applicationProvider, clientFactory, config);
  }

  protected getAuthMode(): string {
    return "application";
  }

  protected getCredentialCacheKeyComponents(
    context: ApplicationAuthContext,
  ): string[] {
    return [];
  }

  protected createClientCacheKey(
    context: ApplicationAuthContext,
    options?: TOptions,
  ): string {
    const parts = [this.config.cacheKeyPrefix, "application"];

    const fingerprint = this.clientFactory.getClientFingerprint?.(options);
    if (fingerprint) {
      parts.push(fingerprint);
    }

    return parts.join("::");
  }

  protected getLoggingContext(
    context: ApplicationAuthContext,
  ): Record<string, any> {
    return {};
  }
}
