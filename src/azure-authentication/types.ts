import { type TokenCredential } from "@azure/identity";

export interface AuthenticationRequest {
  readonly mode: "application" | "delegated";
}

export interface ApplicationAuthRequest extends AuthenticationRequest {
  readonly mode: "application";
}

export interface DelegatedAuthRequest extends AuthenticationRequest {
  readonly mode: "delegated";
  readonly accessToken: string;
}

export type AuthRequest = ApplicationAuthRequest | DelegatedAuthRequest;

export interface ClientFactory<TClient, TOptions = void> {
  createClient(
    credential: TokenCredential,
    options?: TOptions,
  ): Promise<TClient>;
  getClientFingerprint?(options?: TOptions): string | undefined;
}
