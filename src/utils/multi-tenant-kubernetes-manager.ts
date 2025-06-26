import { KubeconfigManager } from "../auth/kubeconfig-manager.js";
import { UserContext, ResourceId } from "../types/multi-tenant.js";
import { KubernetesManager } from "./kubernetes-manager.js";

export class MultiTenantKubernetesManager {
  private kubeconfigManager: KubeconfigManager;

  constructor(kubeconfigManager: KubeconfigManager) {
    this.kubeconfigManager = kubeconfigManager;
    this.setupCleanupHandlers();
  }

  async getTenantKubernetesManager(
    userContext: UserContext,
    resourceId: ResourceId,
  ): Promise<KubernetesManager> {
    const { k8sManager } =
      await this.kubeconfigManager.getOrCreateKubernetesManager(
        userContext,
        resourceId,
      );
    return k8sManager;
  }

  async getOrCreateTenantKubeconfig(
    userContext: UserContext,
    resourceId: ResourceId,
  ): Promise<string> {
    const { kubeconfigPath } =
      await this.kubeconfigManager.getOrCreateKubernetesManager(
        userContext,
        resourceId,
      );
    return kubeconfigPath;
  }

  async cleanupTenant(
    userContext: UserContext,
    resourceId: ResourceId,
  ): Promise<void> {
    await this.kubeconfigManager.cleanupTenant(userContext, resourceId);
  }

  async cleanupAllTenants(): Promise<void> {
    await this.kubeconfigManager.cleanupAllTenants();
  }

  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      await this.cleanupAllTenants();
    };

    process.on("SIGINT", async () => {
      await cleanup();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await cleanup();
      process.exit(0);
    });
  }
}
