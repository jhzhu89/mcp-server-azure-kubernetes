export const cleanupSchema = {
  name: "cleanup",
  description: "Cleanup all managed resources",
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
    },
  },
} as const;
