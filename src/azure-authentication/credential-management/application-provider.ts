import { AzureCliCredential, type TokenCredential } from "@azure/identity";
import { type ApplicationAuthContext } from "./auth-context.js";
import { type ApplicationCredentialProvider as IApplicationCredentialProvider } from "./credential-types.js";
import { credentialLogger } from "../logging.js";

export class ApplicationCredentialProvider
  implements IApplicationCredentialProvider
{
  async createCredential(
    context: ApplicationAuthContext,
  ): Promise<TokenCredential> {
    credentialLogger.debug({}, "Creating AzureCliCredential");
    return new AzureCliCredential();
  }
}
