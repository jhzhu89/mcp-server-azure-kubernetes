import { ContainerServiceClient } from "@azure/arm-containerservice";
import {
  type ClientFactory,
  type CredentialProvider,
  CredentialType,
  getLogger,
} from "@jhzhu89/azure-client-pool";
import * as yaml from "yaml";
import { ManagedKubernetesClient } from "./managed-k8s-client.js";
import {
  getKubeconfigCredentialType,
  getAksTokenCredentialType,
  type CredentialType as K8sCredentialType,
} from "../config/k8s-auth-config.js";

const logger = getLogger("k8s-client-factory");

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
    logger.debug("Creating K8s client", { context });

    const kubeconfigCredType = getKubeconfigCredentialType();
    const aksTokenCredType = getAksTokenCredentialType();

    const [baseKubeconfig, aksToken] = await Promise.all([
      this.getBaseKubeconfig(credentialProvider, context, kubeconfigCredType),
      this.getAksToken(credentialProvider, aksTokenCredType),
    ]);

    logger.debug("Retrieved kubeconfig and token", {
      kubeconfigLength: baseKubeconfig.length,
      aksTokenLength: aksToken.length,
    });

    const kubeconfigContent = this.injectAksToken(baseKubeconfig, aksToken);

    const client = new ManagedKubernetesClient(kubeconfigContent);
    logger.debug("K8s client created");

    return client;
  }

  getClientFingerprint(context: K8sContext): string {
    return `${context.subscriptionId}:${context.resourceGroup}:${context.clusterName}`;
  }

  private async getBaseKubeconfig(
    credentialProvider: CredentialProvider,
    context: K8sContext,
    credentialType: K8sCredentialType,
  ): Promise<string> {
    logger.debug("Getting kubeconfig", { context, credentialType });

    const credType =
      credentialType === "delegated"
        ? CredentialType.Delegated
        : CredentialType.Application;

    const credential = await credentialProvider.getCredential(credType);

    const client = new ContainerServiceClient(
      credential,
      context.subscriptionId,
    );

    try {
      const result = await client.managedClusters.listClusterUserCredentials(
        context.resourceGroup,
        context.clusterName,
      );

      logger.debug("Cluster credentials retrieved", {
        resourceGroup: context.resourceGroup,
        clusterName: context.clusterName,
        kubeconfigCount: result.kubeconfigs?.length || 0,
      });

      const kubeconfigData = result.kubeconfigs?.[0]?.value;
      if (!kubeconfigData) {
        logger.error("No kubeconfig available");
        throw new Error("No kubeconfig available");
      }

      const parsedConfig = this.parseKubeconfigData(kubeconfigData);
      logger.debug("Kubeconfig parsed", { configLength: parsedConfig.length });

      return parsedConfig;
    } catch (error) {
      logger.error("Failed to get kubeconfig", {
        error: error instanceof Error ? error.message : String(error),
        context,
      });
      throw error;
    }
  }

  private async getAksToken(
    credentialProvider: CredentialProvider,
    credentialType: K8sCredentialType,
  ): Promise<string> {
    logger.debug("Getting AKS token", { credentialType });

    const credType =
      credentialType === "delegated"
        ? CredentialType.Delegated
        : CredentialType.Application;

    const credential = await credentialProvider.getCredential(credType);

    const scopes =
      credentialType === "delegated"
        ? ["6dae42f8-4368-4678-94ff-3960e28e3630/user.read"]
        : ["6dae42f8-4368-4678-94ff-3960e28e3630", "user.read"];

    try {
      const tokenResponse = await credential.getToken(scopes);

      if (!tokenResponse) {
        logger.error("Failed to acquire AKS token");
        throw new Error("Failed to acquire AKS token");
      }

      logger.debug("AKS token acquired", {
        tokenLength: tokenResponse.token.length,
      });

      return tokenResponse.token;
    } catch (error) {
      logger.error("Failed to get AKS token", {
        error: error instanceof Error ? error.message : String(error),
        credentialType,
      });
      throw error;
    }
  }

  private injectAksToken(kubeconfigYaml: string, aksToken: string): string {
    try {
      const config = yaml.parse(kubeconfigYaml);

      if (config.users?.[0]) {
        const user = config.users[0].user;
        if (user?.["client-certificate-data"] || user?.["client-key-data"]) {
          logger.warn("k8s local account found");
        } else {
          config.users[0].user = { token: aksToken };
          logger.debug("Token injected into kubeconfig");
        }
      } else {
        logger.warn("No users found in kubeconfig for token injection");
      }

      return yaml.stringify(config);
    } catch (error) {
      logger.error("Failed to inject AKS token", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private parseKubeconfigData(data: any): string {
    try {
      let result: string;

      if (typeof data === "string") {
        result = data;
      } else if (data instanceof Uint8Array) {
        result = Buffer.from(data).toString("utf-8");
      } else {
        result = String(data);
      }

      logger.debug("Kubeconfig data parsed", { resultLength: result.length });

      return result;
    } catch (error) {
      logger.error("Failed to parse kubeconfig data", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
