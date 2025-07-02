import { ContainerServiceClient } from "@azure/arm-containerservice";
import { TokenCredential } from "@azure/identity";
import * as yaml from "yaml";
import { ManagedKubernetesClient } from "./managed-k8s-client.js";
import { ClientFactory } from "@jhzhu89/azure-client-pool";

interface K8sContext {
  subscriptionId: string;
  resourceGroup: string;
  clusterName: string;
}

export class K8sClientFactory
  implements ClientFactory<ManagedKubernetesClient, K8sContext>
{
  async createClient(
    credential: TokenCredential,
    context: K8sContext,
  ): Promise<ManagedKubernetesClient> {
    const [baseKubeconfig, aksToken] = await Promise.all([
      this.getBaseKubeconfig(credential, context),
      this.getAksToken(credential),
    ]);

    const kubeconfigContent = this.injectAksToken(baseKubeconfig, aksToken);

    return new ManagedKubernetesClient(kubeconfigContent);
  }

  getClientFingerprint(context: K8sContext): string {
    return `${context.subscriptionId}:${context.resourceGroup}:${context.clusterName}`;
  }

  private async getBaseKubeconfig(
    credential: TokenCredential,
    context: K8sContext,
  ): Promise<string> {
    const client = new ContainerServiceClient(
      credential,
      context.subscriptionId,
    );

    const result = await client.managedClusters.listClusterUserCredentials(
      context.resourceGroup,
      context.clusterName,
    );

    const kubeconfigData = result.kubeconfigs?.[0]?.value;
    if (!kubeconfigData) {
      throw new Error("No kubeconfig available");
    }

    return this.parseKubeconfigData(kubeconfigData);
  }

  private async getAksToken(credential: TokenCredential): Promise<string> {
    const tokenResponse = await credential.getToken([
      "6dae42f8-4368-4678-94ff-3960e28e3630/user.read",
    ]);

    if (!tokenResponse) {
      throw new Error("Failed to acquire AKS token");
    }

    return tokenResponse.token;
  }

  private injectAksToken(kubeconfigYaml: string, aksToken: string): string {
    const config = yaml.parse(kubeconfigYaml);

    if (config.users?.[0]) {
      config.users[0].user = { token: aksToken };
    }

    return yaml.stringify(config);
  }

  private parseKubeconfigData(data: any): string {
    if (typeof data === "string") {
      return data;
    } else if (data instanceof Uint8Array) {
      return Buffer.from(data).toString("utf-8");
    } else {
      return String(data);
    }
  }
}
