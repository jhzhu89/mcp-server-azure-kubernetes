import fs from "fs/promises";
import crypto from "crypto";
import * as yaml from "yaml";
import { ContainerServiceClient } from "@azure/arm-containerservice";
import { TokenCredential } from "@azure/identity";
import { LRUCache } from "lru-cache";
import { buildKubeconfigPath, buildCacheKey } from "../constants/naming.js";
import { MultiTenantError, MultiTenantErrorCode } from "../types/errors.js";
import {
  UserContext,
  ResourceId,
  MultiTenantConfig,
} from "../types/multi-tenant.js";
import { TokenManagerBase } from "./token-manager-base.js";
import { KubernetesManager } from "../utils/kubernetes-manager.js";
import { AzureAuthManager } from "./azure-token-manager.js";

interface KubeconfigCacheEntry {
  kubeconfigPath: string;
  k8sManager: KubernetesManager;
  expiresAt: number;
}

export class KubeconfigManager extends TokenManagerBase {
  private kubeconfigCache: LRUCache<string, KubeconfigCacheEntry>;
  private activeKubeconfigs: Set<string> = new Set();
  private activeRequests: Map<string, Promise<KubeconfigCacheEntry>> =
    new Map();
  private azureAuthManager: AzureAuthManager;

  constructor(config: MultiTenantConfig, azureAuthManager: AzureAuthManager) {
    super(config);
    this.azureAuthManager = azureAuthManager;

    this.kubeconfigCache = new LRUCache<string, KubeconfigCacheEntry>({
      max: config.cache.maxCacheSize,
      ttl: 30 * 60 * 1000,
      dispose: (value, key) => {
        this.cleanupKubeconfigEntry(value);
      },
    });

    this.setupCleanupHandlers();
  }

  async getOrCreateKubernetesManager(
    userContext: UserContext,
    resourceId: ResourceId,
  ): Promise<{ kubeconfigPath: string; k8sManager: KubernetesManager }> {
    const cacheKey = buildCacheKey(
      "kubeconfig",
      userContext.tenantId,
      userContext.userObjectId,
      resourceId.subscriptionId,
      resourceId.resourceGroup,
      resourceId.clusterName,
    );

    const cached = this.kubeconfigCache.get(cacheKey);
    const bufferMs = this.config.cache.safetyBufferMinutes * 60 * 1000;
    if (cached && cached.expiresAt > Date.now() + bufferMs) {
      return {
        kubeconfigPath: cached.kubeconfigPath,
        k8sManager: cached.k8sManager,
      };
    }

    let activeRequest = this.activeRequests.get(cacheKey);
    if (!activeRequest) {
      activeRequest = this.executeKubeconfigCreation(userContext, resourceId);
      this.activeRequests.set(cacheKey, activeRequest);
    }

    try {
      const result = await activeRequest;
      this.kubeconfigCache.set(cacheKey, result);
      return {
        kubeconfigPath: result.kubeconfigPath,
        k8sManager: result.k8sManager,
      };
    } finally {
      this.activeRequests.delete(cacheKey);
    }
  }

  private async executeKubeconfigCreation(
    userContext: UserContext,
    resourceId: ResourceId,
  ): Promise<KubeconfigCacheEntry> {
    const aksTokenResult = await this.getAksToken(userContext, resourceId);
    const tokenHash = crypto
      .createHash("sha256")
      .update(aksTokenResult.token)
      .digest("hex");

    const kubeconfigPath = buildKubeconfigPath(
      userContext.tenantId,
      userContext.userObjectId,
      tokenHash,
    );

    let finalPath: string;
    if (await this.isValidFile(kubeconfigPath)) {
      finalPath = kubeconfigPath;
    } else {
      const kubeconfigContent = await this.generateKubeconfigContent(
        userContext,
        resourceId,
        aksTokenResult.token,
      );
      finalPath = await this.createSecureTempKubeconfig(
        kubeconfigContent,
        kubeconfigPath,
      );
    }

    const k8sManager = new KubernetesManager(finalPath);

    return {
      kubeconfigPath: finalPath,
      k8sManager,
      expiresAt: aksTokenResult.expiresAt,
    };
  }

  private async getAksToken(
    userContext: UserContext,
    resourceId: ResourceId,
  ): Promise<{ token: string; expiresAt: number }> {
    try {
      const tokenResult = await this.performOboFlow(
        userContext.accessToken,
        "6dae42f8-4368-4678-94ff-3960e28e3630/user.read",
        userContext.tenantId,
      );
      return {
        token: tokenResult.accessToken,
        expiresAt: tokenResult.expiresAt,
      };
    } catch (error) {
      throw new MultiTenantError(
        MultiTenantErrorCode.TOKEN_ACQUISITION_FAILED,
        `Failed to acquire AKS token: ${error}`,
        userContext.userObjectId,
        userContext.tenantId,
      );
    }
  }

  private async generateKubeconfigContent(
    userContext: UserContext,
    resourceId: ResourceId,
    aksToken: string,
  ): Promise<string> {
    const armTokenResult = await this.azureAuthManager.getArmToken(userContext);

    const credential = {
      getToken: async () => ({
        token: armTokenResult.token,
        expiresOnTimestamp: armTokenResult.expiresAt,
      }),
    } as TokenCredential;

    const client = new ContainerServiceClient(
      credential,
      resourceId.subscriptionId,
    );

    try {
      const userCredentials =
        await client.managedClusters.listClusterUserCredentials(
          resourceId.resourceGroup,
          resourceId.clusterName,
        );

      if (
        !userCredentials.kubeconfigs ||
        userCredentials.kubeconfigs.length === 0
      ) {
        throw new Error("No user kubeconfig available");
      }

      const kubeconfigData = userCredentials.kubeconfigs[0].value;
      if (!kubeconfigData) {
        throw new Error("Kubeconfig data is empty");
      }

      let kubeconfigString: string;
      if (typeof kubeconfigData === "string") {
        kubeconfigString = kubeconfigData;
      } else if (kubeconfigData instanceof Uint8Array) {
        kubeconfigString = Buffer.from(kubeconfigData).toString("utf-8");
      } else {
        kubeconfigString = String(kubeconfigData);
      }

      let kubeconfigObj: any;
      try {
        kubeconfigObj = yaml.parse(kubeconfigString);
      } catch (yamlError) {
        try {
          kubeconfigObj = JSON.parse(kubeconfigString);
        } catch (jsonError) {
          throw new Error(`Failed to parse kubeconfig: ${yamlError}`);
        }
      }

      if (kubeconfigObj.users && kubeconfigObj.users.length > 0) {
        kubeconfigObj.users[0].user = {
          token: aksToken,
        };
        kubeconfigObj.users[0].name = userContext.userObjectId;

        if (kubeconfigObj.contexts && kubeconfigObj.contexts.length > 0) {
          kubeconfigObj.contexts[0].context.user = userContext.userObjectId;
        }
      }

      return yaml.stringify(kubeconfigObj);
    } catch (error) {
      throw new MultiTenantError(
        MultiTenantErrorCode.KUBECONFIG_GENERATION_FAILED,
        `Failed to generate kubeconfig: ${error}`,
        userContext.userObjectId,
        userContext.tenantId,
      );
    }
  }

  private async createSecureTempKubeconfig(
    kubeconfigContent: string,
    finalPath: string,
  ): Promise<string> {
    try {
      await fs.access("/dev/shm", fs.constants.W_OK);
    } catch (error) {
      throw new MultiTenantError(
        MultiTenantErrorCode.TEMP_FILE_CREATION_FAILED,
        "/dev/shm is not available for secure file storage",
      );
    }

    const tempPath = `${finalPath}.tmp.${process.pid}.${Date.now()}`;

    try {
      await fs.writeFile(tempPath, kubeconfigContent, { mode: 0o600 });

      try {
        await fs.rename(tempPath, finalPath);
        this.activeKubeconfigs.add(finalPath);
        return finalPath;
      } catch (renameError) {
        await this.safeDelete(tempPath);

        if (await this.isValidFile(finalPath)) {
          return finalPath;
        }
        throw renameError;
      }
    } catch (error) {
      await this.safeDelete(tempPath);
      throw new MultiTenantError(
        MultiTenantErrorCode.TEMP_FILE_CREATION_FAILED,
        `Failed to create secure kubeconfig: ${error}`,
      );
    }
  }

  private async isValidFile(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isFile() && (stats.mode & 0o777) === 0o600;
    } catch {
      return false;
    }
  }

  private async safeDelete(path: string): Promise<void> {
    try {
      await fs.unlink(path);
      this.activeKubeconfigs.delete(path);
    } catch {}
  }

  private cleanupKubeconfigEntry(entry: KubeconfigCacheEntry): void {
    try {
      entry.k8sManager.cleanup();
      this.safeDelete(entry.kubeconfigPath);
    } catch {}
  }

  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      this.kubeconfigCache.clear();
      const promises = Array.from(this.activeKubeconfigs).map((path) =>
        this.safeDelete(path),
      );
      await Promise.allSettled(promises);
    };

    process.on("exit", () => {
      for (const path of this.activeKubeconfigs) {
        try {
          require("fs").unlinkSync(path);
        } catch {}
      }
    });

    process.on("SIGINT", async () => {
      await cleanup();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await cleanup();
      process.exit(0);
    });
  }

  async cleanupTenant(
    userContext: UserContext,
    resourceId: ResourceId,
  ): Promise<void> {
    const cacheKey = buildCacheKey(
      "kubeconfig",
      userContext.tenantId,
      userContext.userObjectId,
      resourceId.subscriptionId,
      resourceId.resourceGroup,
      resourceId.clusterName,
    );
    const entry = this.kubeconfigCache.get(cacheKey);

    if (entry) {
      this.cleanupKubeconfigEntry(entry);
      this.kubeconfigCache.delete(cacheKey);
    }
  }

  async cleanupAllTenants(): Promise<void> {
    this.kubeconfigCache.clear();
    this.activeRequests.clear();
  }
}
