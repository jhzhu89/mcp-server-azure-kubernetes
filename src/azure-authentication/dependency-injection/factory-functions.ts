import {
  JwtHandler,
  type JwtConfig,
} from "../token-validation/jwt-validator.js";
import { DelegatedCredentialProvider } from "../credential-management/delegated-provider.js";
import { ApplicationCredentialProvider } from "../credential-management/application-provider.js";
import { ApplicationClientManager } from "../client-lifecycle/application-manager.js";
import { DelegatedClientManager } from "../client-lifecycle/delegated-manager.js";
import { type ClientFactory } from "../client-lifecycle/client-types.js";
import {
  type DelegatedAuthenticationConfig,
  type ClientManagerConfig,
} from "../configuration.js";

export function createJwtHandler(config: JwtConfig): JwtHandler {
  return new JwtHandler(config);
}

export function createApplicationClientManager<TClient, TOptions = void>(
  clientFactory: ClientFactory<TClient, TOptions>,
  config: ClientManagerConfig,
): ApplicationClientManager<TClient, TOptions> {
  const applicationProvider = new ApplicationCredentialProvider();
  return new ApplicationClientManager(
    applicationProvider,
    clientFactory,
    config,
  );
}

export function createDelegatedClientManager<TClient, TOptions = void>(
  config: DelegatedAuthenticationConfig,
  clientManagerConfig: ClientManagerConfig,
  clientFactory: ClientFactory<TClient, TOptions>,
): DelegatedClientManager<TClient, TOptions> {
  const delegatedProvider = new DelegatedCredentialProvider({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    certificatePath: config.certificatePath,
    certificatePassword: config.certificatePassword,
    tenantId: config.tenantId,
  });

  return new DelegatedClientManager(
    delegatedProvider,
    clientFactory,
    clientManagerConfig,
  );
}
