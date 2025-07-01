import { McpRequestMapper } from "../azure-authentication/index.js";

interface K8sContext {
  subscriptionId: string;
  resourceGroup: string;
  clusterName: string;
}

export class K8sRequestMapper extends McpRequestMapper {
  mapToOptions(request: any): K8sContext {
    const args = request.params?.arguments || {};

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
