import { OnBehalfOfCredential } from "@azure/identity";
import { MultiTenantError, MultiTenantErrorCode } from "../types/errors.js";
import { MultiTenantConfig } from "../types/multi-tenant.js";

export interface TokenWithExpiry {
  accessToken: string;
  expiresAt: number;
}

export abstract class TokenManagerBase {
  protected config: MultiTenantConfig;

  constructor(config: MultiTenantConfig) {
    this.config = config;
  }

  protected async performOboFlow(
    accessToken: string,
    scope: string,
    userTenantId: string,
  ): Promise<TokenWithExpiry> {
    try {
      let oboCredential: OnBehalfOfCredential;

      if (this.config.azure.clientSecret) {
        oboCredential = new OnBehalfOfCredential({
          tenantId: userTenantId,
          clientId: this.config.azure.clientId,
          clientSecret: this.config.azure.clientSecret,
          userAssertionToken: accessToken,
        });
      } else if (this.config.azure.certificatePath) {
        oboCredential = new OnBehalfOfCredential({
          tenantId: userTenantId,
          clientId: this.config.azure.clientId,
          certificatePath: this.config.azure.certificatePath,
          userAssertionToken: accessToken,
        });
      } else {
        throw new Error(
          "Neither client secret nor certificate path is configured",
        );
      }

      const tokenResponse = await oboCredential.getToken(scope);

      if (!tokenResponse?.token) {
        throw new Error("No access token received from OBO flow");
      }

      return {
        accessToken: tokenResponse.token,
        expiresAt: tokenResponse.expiresOnTimestamp,
      };
    } catch (error) {
      throw new MultiTenantError(
        MultiTenantErrorCode.AZURE_OBO_FAILED,
        `OBO flow failed: ${error}`,
      );
    }
  }
}
