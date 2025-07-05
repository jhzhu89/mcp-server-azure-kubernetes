import { ContainerServiceClient } from "@azure/arm-containerservice";
import {
  type ClientFactory,
  type CredentialProvider,
  CredentialType,
} from "@jhzhu89/azure-client-pool";
import * as yaml from "yaml";
import { ManagedKubernetesClient } from "./managed-k8s-client.js";
import {
  getKubeconfigCredentialType,
  getAksTokenCredentialType,
  type CredentialType as K8sCredentialType,
} from "../config/k8s-auth-config.js";

interface K8sContext {
  subscriptionId: string;
  resourceGroup: string;
  clusterName: string;
}

export class K8sClientFactory
  implements ClientFactory<ManagedKubernetesClient, K8sContext>
{
  async createClient(
    credentialProvider: CredentialProvider,
    context: K8sContext,
  ): Promise<ManagedKubernetesClient> {
    const kubeconfigCredType = getKubeconfigCredentialType();
    const aksTokenCredType = getAksTokenCredentialType();

    const [baseKubeconfig, aksToken] = await Promise.all([
      this.getBaseKubeconfig(credentialProvider, context, kubeconfigCredType),
      this.getAksToken(credentialProvider, aksTokenCredType),
    ]);

    const kubeconfigContent = this.injectAksToken(baseKubeconfig, aksToken);

    return new ManagedKubernetesClient(kubeconfigContent);
  }

  getClientFingerprint(context: K8sContext): string {
    return `${context.subscriptionId}:${context.resourceGroup}:${context.clusterName}`;
  }

  private async getBaseKubeconfig(
    credentialProvider: CredentialProvider,
    context: K8sContext,
    credentialType: K8sCredentialType,
  ): Promise<string> {
    const credType =
      credentialType === "delegated"
        ? CredentialType.Delegated
        : CredentialType.Application;

    const credential = await credentialProvider.getCredential(credType);

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

  private async getAksToken(
    credentialProvider: CredentialProvider,
    credentialType: K8sCredentialType,
  ): Promise<string> {
    const credType =
      credentialType === "delegated"
        ? CredentialType.Delegated
        : CredentialType.Application;

    const credential = await credentialProvider.getCredential(credType);

    // Different credential types require different scope formats
    const scopes =
      credentialType === "delegated"
        ? ["6dae42f8-4368-4678-94ff-3960e28e3630/user.read"] // OBO/Delegated format
        : ["6dae42f8-4368-4678-94ff-3960e28e3630", "user.read"]; // CLI format

    const tokenResponse = await credential.getToken(scopes);

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
