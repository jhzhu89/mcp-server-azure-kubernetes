import { type ClientFactory } from "./types.js";
import { type BaseClientManager } from "./client-lifecycle/base-manager.js";
import {
  type AuthenticationStrategy,
  ApplicationAuthStrategy,
  DelegatedAuthStrategy,
} from "./credential-management/strategies.js";
import { type AuthRequest } from "./types.js";
import {
  getAzureAuthConfig,
  getDelegatedCredentialConfig,
  getDelegatedClientManagerConfig,
  getApplicationClientManagerConfig,
  getJwtConfig,
} from "./configuration.js";
import {
  createApplicationClientManager,
  createDelegatedClientManager,
  createJwtHandler,
} from "./dependency-injection/factory-functions.js";
import { type RequestMapper } from "./request-mapper.js";

export interface AuthenticatedClientProvider<TClient, TOptions = void> {
  getAuthenticatedClient(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<TClient>;
  invalidateClientCache(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<boolean>;
}

class AuthenticatedClientProviderImpl<TClient, TOptions = void>
  implements AuthenticatedClientProvider<TClient, TOptions>
{
  constructor(
    private clientManager: BaseClientManager<TClient, any, TOptions>,
    private authStrategy: AuthenticationStrategy<AuthRequest>,
  ) {}

  async getAuthenticatedClient(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<TClient> {
    const context = await this.authStrategy.createAuthContext(authRequest);
    return await this.clientManager.getClient(context, options);
  }

  async invalidateClientCache(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<boolean> {
    const context = await this.authStrategy.createAuthContext(authRequest);
    return this.clientManager.removeCachedClientByContext(context, options);
  }
}

export async function createClientProvider<TClient, TOptions = void>(
  clientFactory: ClientFactory<TClient, TOptions>,
  authMode?: "application" | "delegated",
): Promise<AuthenticatedClientProvider<TClient, TOptions>> {
  const config = authMode || getAzureAuthConfig().authMode;
  let clientManager: BaseClientManager<TClient, any, TOptions>;
  let authStrategy: AuthenticationStrategy<AuthRequest>;

  if (config === "application") {
    const managerConfig = getApplicationClientManagerConfig();
    clientManager = createApplicationClientManager(
      clientFactory,
      managerConfig,
    );
    authStrategy = new ApplicationAuthStrategy();
  } else if (config === "delegated") {
    const delegatedCredentialConfig = getDelegatedCredentialConfig();
    const clientManagerConfig = getDelegatedClientManagerConfig();
    const jwtConfig = getJwtConfig();
    const jwtHandler = createJwtHandler(jwtConfig);
    clientManager = createDelegatedClientManager(
      delegatedCredentialConfig,
      clientManagerConfig,
      clientFactory,
    );
    authStrategy = new DelegatedAuthStrategy(jwtHandler);
  } else {
    throw new Error(`Unknown auth mode: ${config}`);
  }

  return new AuthenticatedClientProviderImpl(clientManager, authStrategy);
}

export async function createClientProviderWithMapper<
  TClient,
  TRequest,
  TOptions = void,
>(
  clientFactory: ClientFactory<TClient, TOptions>,
  requestMapper: RequestMapper<TRequest, TOptions>,
  authMode?: "application" | "delegated",
) {
  const clientProvider = await createClientProvider(clientFactory, authMode);
  const config = authMode || getAzureAuthConfig().authMode;

  return {
    getAuthenticatedClient: async (request: TRequest) => {
      const authRequest = requestMapper.mapToAuthRequest(request, config);
      const options = requestMapper.mapToOptions
        ? requestMapper.mapToOptions(request)
        : undefined;
      return await clientProvider.getAuthenticatedClient(authRequest, options);
    },
    invalidateClientCache: async (request: TRequest) => {
      const authRequest = requestMapper.mapToAuthRequest(request, config);
      const options = requestMapper.mapToOptions
        ? requestMapper.mapToOptions(request)
        : undefined;
      return await clientProvider.invalidateClientCache(authRequest, options);
    },
  };
}
