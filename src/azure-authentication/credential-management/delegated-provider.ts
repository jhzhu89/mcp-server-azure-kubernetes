import {
  OnBehalfOfCredential,
  type TokenCredential,
  type OnBehalfOfCredentialCertificateOptions,
  type OnBehalfOfCredentialSecretOptions,
} from "@azure/identity";
import { type DelegatedAuthContext } from "./auth-context.js";
import { type DelegatedCredentialProvider as IDelegatedCredentialProvider } from "./credential-types.js";
import { type DelegatedAuthenticationConfig } from "../configuration.js";
import { credentialLogger } from "../logging.js";

export class DelegatedCredentialProvider
  implements IDelegatedCredentialProvider
{
  private readonly usesCertificate: boolean;

  constructor(private config: DelegatedAuthenticationConfig) {
    this.usesCertificate = !!config.certificatePath;

    // Validate configuration at construction time
    if (!this.usesCertificate && !config.clientSecret) {
      throw new Error(
        "Azure authentication requires either client certificate path or client secret",
      );
    }

    if (this.usesCertificate && config.clientSecret) {
      throw new Error(
        "Only one of certificatePath or clientSecret should be provided",
      );
    }
  }

  async createCredential(
    context: DelegatedAuthContext,
  ): Promise<TokenCredential> {
    if (context.mode !== "delegated") {
      throw new Error(`Expected delegated auth context, got ${context.mode}`);
    }

    const delegatedContext = context;

    credentialLogger.debug(
      {
        tenantId: delegatedContext.tenantId,
      },
      "Creating OBO credential",
    );

    const credential = this.createOBOCredential(delegatedContext);

    credentialLogger.debug(
      {
        tenantId: delegatedContext.tenantId,
      },
      "OBO credential created",
    );

    return credential;
  }

  private createOBOCredential(
    context: DelegatedAuthContext,
  ): OnBehalfOfCredential {
    const baseOptions = {
      tenantId: context.tenantId,
      clientId: this.config.clientId,
      userAssertionToken: context.accessToken,
    };

    if (this.usesCertificate) {
      const options: OnBehalfOfCredentialCertificateOptions = {
        ...baseOptions,
        certificatePath: this.config.certificatePath!,
      };
      return new OnBehalfOfCredential(options);
    } else {
      const options: OnBehalfOfCredentialSecretOptions = {
        ...baseOptions,
        clientSecret: this.config.clientSecret!,
      };
      return new OnBehalfOfCredential(options);
    }
  }
}
