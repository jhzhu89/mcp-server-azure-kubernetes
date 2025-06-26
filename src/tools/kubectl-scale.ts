import { KubernetesManager } from "../types.js";
import { execSync } from "child_process";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export const kubectlScaleSchema = {
  name: "kubectl_scale",
  description: "Scale a Kubernetes deployment",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: {
        type: "string",
        description: "Azure subscription ID for multi-tenant authentication",
      },
      resourceGroup: {
        type: "string",
        description:
          "Azure resource group name for multi-tenant authentication",
      },
      clusterName: {
        type: "string",
        description:
          "Azure Kubernetes cluster name for multi-tenant authentication",
      },
      name: {
        type: "string",
        description: "Name of the deployment to scale",
      },
      namespace: {
        type: "string",
        description: "Namespace of the deployment",
        default: "default",
      },
      replicas: {
        type: "number",
        description: "Number of replicas to scale to",
      },
      resourceType: {
        type: "string",
        description:
          "Resource type to scale (deployment, replicaset, statefulset)",
        default: "deployment",
      },
    },
    required: [
      "subscriptionId",
      "resourceGroup",
      "clusterName",
      "name",
      "replicas",
    ],
  },
};

export async function kubectlScale(
  kubeconfigPath: string,
  input: {
    name: string;
    namespace?: string;
    replicas: number;
    resourceType?: string;
  },
) {
  try {
    const namespace = input.namespace || "default";
    const resourceType = input.resourceType || "deployment";

    // Build the kubectl scale command
    let command = `kubectl scale ${resourceType} ${input.name} --replicas=${input.replicas} --namespace=${namespace}`;

    // Execute the command
    try {
      const result = execSync(command, {
        encoding: "utf8",
        env: { ...process.env, KUBECONFIG: kubeconfigPath },
      });

      return {
        content: [
          {
            success: true,
            message: `Scaled ${resourceType} ${input.name} to ${input.replicas} replicas`,
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to scale ${resourceType}: ${error.message}`,
      );
    }
  } catch (error: any) {
    if (error instanceof McpError) {
      return {
        content: [
          {
            success: false,
            message: error.message,
          },
        ],
      };
    }

    return {
      content: [
        {
          success: false,
          message: `Failed to scale resource: ${error.message}`,
        },
      ],
    };
  }
}
