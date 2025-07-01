import {
  type AuthenticationRequest,
  type ApplicationAuthRequest,
  type DelegatedAuthRequest,
} from "../types.js";
import {
  ApplicationAuthContext,
  DelegatedAuthContext,
} from "./auth-context.js";
import { type JwtHandler } from "../token-validation/jwt-validator.js";

export interface AuthenticationStrategy<
  TRequest extends AuthenticationRequest = AuthenticationRequest,
  TContext = any,
> {
  createAuthContext(authRequest: TRequest): Promise<TContext>;
}

export class ApplicationAuthStrategy
  implements
    AuthenticationStrategy<ApplicationAuthRequest, ApplicationAuthContext>
{
  async createAuthContext(
    authRequest: ApplicationAuthRequest,
  ): Promise<ApplicationAuthContext> {
    return new ApplicationAuthContext();
  }
}

export class DelegatedAuthStrategy
  implements AuthenticationStrategy<DelegatedAuthRequest, DelegatedAuthContext>
{
  constructor(private jwtHandler: JwtHandler) {}

  async createAuthContext(
    authRequest: DelegatedAuthRequest,
  ): Promise<DelegatedAuthContext> {
    try {
      const parsedToken = await this.jwtHandler.validateToken(
        authRequest.accessToken,
      );
      return new DelegatedAuthContext(parsedToken);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Authentication failed";
      throw new Error(`Authentication error: ${errorMessage}`);
    }
  }
}
