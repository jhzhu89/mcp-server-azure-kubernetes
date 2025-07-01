import * as fs from "fs";
import * as crypto from "crypto";
import { KubernetesManager } from "./kubernetes-manager.js";
import { logger } from "../azure-authentication/index.js";

const k8sFileLogger = logger.child({ component: "k8s-files" });

export class ManagedKubernetesClient extends KubernetesManager {
  private static cleanupRegistry = new FinalizationRegistry<string>(
    (kubeconfigPath) => {
      try {
        fs.unlinkSync(kubeconfigPath);
        k8sFileLogger.debug(
          { kubeconfigPath },
          "FinalizationRegistry cleaned up kubeconfig file",
        );
      } catch (error) {
        k8sFileLogger.warn(
          {
            kubeconfigPath,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to cleanup kubeconfig file in FinalizationRegistry",
        );
      }
    },
  );

  private kubeconfigPath: string;
  private disposed = false;

  constructor(kubeconfigContent: string) {
    const kubeconfigPath =
      ManagedKubernetesClient.createKubeconfigFile(kubeconfigContent);
    super(kubeconfigPath);

    this.kubeconfigPath = kubeconfigPath;

    ManagedKubernetesClient.cleanupRegistry.register(this, this.kubeconfigPath);
  }

  private static createKubeconfigFile(content: string): string {
    const hash = crypto
      .createHash("sha256")
      .update(content)
      .digest("hex")
      .substring(0, 16);

    const kubeconfigPath = `/dev/shm/k8s-${hash}-${process.pid}.yaml`;

    if (
      ManagedKubernetesClient.isValidKubeconfigFile(kubeconfigPath, content)
    ) {
      return kubeconfigPath;
    }

    const tempPath = `${kubeconfigPath}.tmp.${Date.now()}.${Math.random().toString(36)}`;
    fs.writeFileSync(tempPath, content, { mode: 0o600 });
    fs.renameSync(tempPath, kubeconfigPath);

    return kubeconfigPath;
  }

  private static isValidKubeconfigFile(
    path: string,
    expectedContent: string,
  ): boolean {
    try {
      const stats = fs.statSync(path);
      if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
        return false;
      }

      const existingContent = fs.readFileSync(path, "utf-8");
      return existingContent === expectedContent;
    } catch {
      return false;
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    try {
      await this.cleanup();

      fs.unlinkSync(this.kubeconfigPath);

      k8sFileLogger.debug(
        { kubeconfigPath: this.kubeconfigPath },
        "Dispose cleaned up kubeconfig file",
      );
    } catch (error) {
      k8sFileLogger.error(
        {
          kubeconfigPath: this.kubeconfigPath,
          error: error instanceof Error ? error.message : String(error),
        },
        "Error during dispose",
      );
      throw error;
    }
  }

  getKubeconfigPath(): string {
    return this.kubeconfigPath;
  }
}
