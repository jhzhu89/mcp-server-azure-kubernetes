import { type TokenCredential } from "@azure/identity";

export interface ClientFactory<TClient, TOptions = void> {
  createClient(
    credential: TokenCredential,
    options?: TOptions,
  ): Promise<TClient>;
  getClientFingerprint?(options?: TOptions): string | undefined;
}
