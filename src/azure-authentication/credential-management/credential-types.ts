import { type TokenCredential } from "@azure/identity";
import {
  type DelegatedAuthContext,
  type ApplicationAuthContext,
} from "./auth-context.js";

export interface CredentialProvider<
  TContext = DelegatedAuthContext | ApplicationAuthContext,
> {
  createCredential(context: TContext): Promise<TokenCredential>;
}

export interface ApplicationCredentialProvider
  extends CredentialProvider<ApplicationAuthContext> {}
export interface DelegatedCredentialProvider
  extends CredentialProvider<DelegatedAuthContext> {}
