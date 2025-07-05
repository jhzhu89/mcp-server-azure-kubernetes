import { type RequestMapper } from "@jhzhu89/azure-client-pool";

interface K8sContext {
  subscriptionId: string;
  resourceGroup: string;
  clusterName: string;
}

export class K8sRequestMapper
  implements RequestMapper<Record<string, unknown>, K8sContext>
{
  extractAuthData(request: Record<string, unknown>): {
    accessToken?: string;
  } & Record<string, unknown> {
    const args = (request as any).params?.arguments || {};

    const authData: { accessToken?: string } & Record<string, unknown> = {};

    if (args.access_token) {
      authData.accessToken = args.access_token;
    }

    return authData;
  }

  extractOptions(request: Record<string, unknown>): K8sContext {
    const args = (request as any).params?.arguments || {};

    const subscriptionId = args.subscriptionId;
    const resourceGroup = args.resourceGroup;
    const clusterName = args.clusterName;

    if (!subscriptionId || !resourceGroup || !clusterName) {
      throw new Error(
        `Missing required Azure parameters. Please provide: subscriptionId, resourceGroup, clusterName. ` +
          `Received: subscriptionId=${subscriptionId}, resourceGroup=${resourceGroup}, clusterName=${clusterName}`,
      );
    }

    return {
      subscriptionId,
      resourceGroup,
      clusterName,
    };
  }
}
