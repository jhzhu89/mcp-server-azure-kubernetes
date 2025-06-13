import {
  ConfidentialClientApplication,
  OnBehalfOfRequest,
} from "@azure/msal-node";
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
    userTenantId: string
  ): Promise<TokenWithExpiry> {
    const msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: this.config.azure.clientId,
        clientSecret: this.config.azure.clientSecret,
        authority: `https://login.microsoftonline.com/${userTenantId}`,
      },
    });

    try {
      const oboRequest: OnBehalfOfRequest = {
        oboAssertion: accessToken,
        scopes: [`${scope}`],
      };

      const response = await msalClient.acquireTokenOnBehalfOf(oboRequest);

      if (!response?.accessToken) {
        throw new Error("No access token received from OBO flow");
      }

      const expiresAt =
        response.expiresOn?.getTime() || Date.now() + 60 * 60 * 1000;

      return {
        accessToken: response.accessToken,
        expiresAt,
      };
    } catch (error) {
      throw new MultiTenantError(
        MultiTenantErrorCode.AZURE_OBO_FAILED,
        `OBO flow failed: ${error}`
      );
    }
  }
}
