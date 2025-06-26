#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  installHelmChart,
  installHelmChartSchema,
  upgradeHelmChart,
  upgradeHelmChartSchema,
  uninstallHelmChart,
  uninstallHelmChartSchema,
} from "./tools/helm-operations.js";
import {
  explainResource,
  explainResourceSchema,
  listApiResources,
  listApiResourcesSchema,
} from "./tools/kubectl-operations.js";
import { readResource, listResources } from "./resources/handlers.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { serverConfig } from "./config/server-config.js";
import { cleanupSchema } from "./config/cleanup-config.js";
import { startStreamableHTTPServer } from "./utils/streamable_http.js";
import { loadMultiTenantConfig } from "./config/multi-tenant-config.js";
import { MultiTenantKubernetesManager } from "./utils/multi-tenant-kubernetes-manager.js";
import { AzureAuthManager } from "./auth/azure-token-manager.js";
import { KubeconfigManager } from "./auth/kubeconfig-manager.js";
import { ResourceId } from "./types/multi-tenant.js";
import {
  startPortForward,
  PortForwardSchema,
  stopPortForward,
  StopPortForwardSchema,
} from "./tools/port_forward.js";
import { kubectlScale, kubectlScaleSchema } from "./tools/kubectl-scale.js";
import { kubectlGet, kubectlGetSchema } from "./tools/kubectl-get.js";
import {
  kubectlDescribe,
  kubectlDescribeSchema,
} from "./tools/kubectl-describe.js";
import { kubectlList, kubectlListSchema } from "./tools/kubectl-list.js";
import { kubectlApply, kubectlApplySchema } from "./tools/kubectl-apply.js";
import { kubectlDelete, kubectlDeleteSchema } from "./tools/kubectl-delete.js";
import { kubectlCreate, kubectlCreateSchema } from "./tools/kubectl-create.js";
import { kubectlLogs, kubectlLogsSchema } from "./tools/kubectl-logs.js";
import {
  kubectlGeneric,
  kubectlGenericSchema,
} from "./tools/kubectl-generic.js";
import { kubectlPatch, kubectlPatchSchema } from "./tools/kubectl-patch.js";
import {
  kubectlRollout,
  kubectlRolloutSchema,
} from "./tools/kubectl-rollout.js";

// Check if non-destructive tools only mode is enabled
const nonDestructiveTools =
  process.env.ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS === "true";

// Define destructive tools (delete and uninstall operations)
const destructiveTools = [
  kubectlDeleteSchema, // This replaces all individual delete operations
  uninstallHelmChartSchema,
  cleanupSchema, // Cleanup is also destructive as it deletes resources
  kubectlGenericSchema, // Generic kubectl command can perform destructive operations
];

// Get all available tools
const allTools = [
  // Core operation tools
  cleanupSchema,

  // Unified kubectl-style tools - these replace many specific tools
  kubectlGetSchema,
  kubectlDescribeSchema,
  kubectlListSchema,
  kubectlApplySchema,
  kubectlDeleteSchema,
  kubectlCreateSchema,
  kubectlLogsSchema,
  kubectlScaleSchema,
  kubectlPatchSchema,
  kubectlRolloutSchema,

  // Special operations that aren't covered by simple kubectl commands
  explainResourceSchema,

  // Helm operations
  installHelmChartSchema,
  upgradeHelmChartSchema,
  uninstallHelmChartSchema,

  // Port forwarding
  PortForwardSchema,
  StopPortForwardSchema,

  // API resource operations
  listApiResourcesSchema,

  // Generic kubectl command
  kubectlGenericSchema,
];

const config = loadMultiTenantConfig();
const azureAuthManager = new AzureAuthManager(config);
const kubeconfigManager = new KubeconfigManager(config, azureAuthManager);
const multiTenantManager = new MultiTenantKubernetesManager(kubeconfigManager);

function createServer(): Server {
  const server = new Server(
    {
      name: serverConfig.name,
      version: serverConfig.version,
    },
    serverConfig,
  );

  async function createMultiTenantContext(
    accessToken: string,
    resourceId: ResourceId,
  ) {
    if (
      !accessToken ||
      !resourceId.subscriptionId ||
      !resourceId.resourceGroup ||
      !resourceId.clusterName
    ) {
      console.log("Validation failed - missing required parameters");
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Access token and Azure context parameters are required for multi-tenant operations",
      );
    }

    const userContext = await azureAuthManager.createUserContext(
      accessToken,
      resourceId.subscriptionId,
    );
    const k8sManager = await multiTenantManager.getTenantKubernetesManager(
      userContext,
      resourceId,
    );
    const kubeconfigPath = await multiTenantManager.getOrCreateTenantKubeconfig(
      userContext,
      resourceId,
    );

    return { k8sManager, kubeconfigPath };
  }

  // Resources handlers
  server.setRequestHandler(ListResourcesRequestSchema, listResources);
  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: {
      params: {
        uri: string;
        arguments?: Record<string, any>;
        _meta?: any;
      };
      method: string;
    }) => {
      const { arguments: input = {} } = request.params;
      const accessToken = input.access_token;
      const resourceId: ResourceId = {
        subscriptionId: input.subscriptionId,
        resourceGroup: input.resourceGroup,
        clusterName: input.clusterName,
      };

      const { k8sManager } = await createMultiTenantContext(
        accessToken,
        resourceId,
      );

      const requestWithParams = {
        params: {
          uri: request.params.uri,
        },
      };

      return await readResource(k8sManager, requestWithParams);
    },
  );

  // Tools handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Filter out destructive tools if ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS is set to 'true'
    const tools = nonDestructiveTools
      ? allTools.filter(
          (tool) => !destructiveTools.some((dt) => dt.name === tool.name),
        )
      : allTools;

    return { tools };
  });

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: {
      params: { name: string; _meta?: any; arguments?: Record<string, any> };
      method: string;
    }) => {
      try {
        const { name, arguments: input = {} } = request.params;
        const accessToken = input.access_token;

        const resourceId: ResourceId = {
          subscriptionId: input.subscriptionId,
          resourceGroup: input.resourceGroup,
          clusterName: input.clusterName,
        };

        const { kubeconfigPath, k8sManager } = await createMultiTenantContext(
          accessToken,
          resourceId,
        );

        if (name === "kubectl_get") {
          return await kubectlGet(
            kubeconfigPath,
            input as {
              resourceType: string;
              name?: string;
              namespace?: string;
              output?: string;
              allNamespaces?: boolean;
              labelSelector?: string;
              fieldSelector?: string;
            },
          );
        }

        if (name === "kubectl_describe") {
          return await kubectlDescribe(
            kubeconfigPath,
            input as {
              resourceType: string;
              name: string;
              namespace?: string;
              allNamespaces?: boolean;
            },
          );
        }

        if (name === "kubectl_list") {
          return await kubectlList(
            kubeconfigPath,
            input as {
              resourceType: string;
              namespace?: string;
              output?: string;
              allNamespaces?: boolean;
              labelSelector?: string;
              fieldSelector?: string;
            },
          );
        }

        if (name === "kubectl_apply") {
          return await kubectlApply(
            kubeconfigPath,
            input as {
              manifest?: string;
              filename?: string;
              namespace?: string;
              dryRun?: boolean;
              force?: boolean;
            },
          );
        }

        if (name === "kubectl_delete") {
          return await kubectlDelete(
            kubeconfigPath,
            input as {
              resourceType?: string;
              name?: string;
              namespace?: string;
              labelSelector?: string;
              manifest?: string;
              filename?: string;
              allNamespaces?: boolean;
              force?: boolean;
              gracePeriodSeconds?: number;
            },
          );
        }

        if (name === "kubectl_create") {
          return await kubectlCreate(
            kubeconfigPath,
            input as {
              manifest?: string;
              filename?: string;
              namespace?: string;
              dryRun?: boolean;
              validate?: boolean;
            },
          );
        }

        if (name === "kubectl_logs") {
          return await kubectlLogs(
            kubeconfigPath,
            input as {
              resourceType: string;
              name: string;
              namespace: string;
              container?: string;
              tail?: number;
              since?: string;
              sinceTime?: string;
              timestamps?: boolean;
              previous?: boolean;
              follow?: boolean;
              labelSelector?: string;
            },
          );
        }

        if (name === "kubectl_patch") {
          return await kubectlPatch(
            kubeconfigPath,
            input as {
              resourceType: string;
              name: string;
              namespace?: string;
              patchType?: "strategic" | "merge" | "json";
              patchData?: object;
              patchFile?: string;
              dryRun?: boolean;
            },
          );
        }

        if (name === "kubectl_rollout") {
          return await kubectlRollout(
            kubeconfigPath,
            input as {
              subCommand:
                | "history"
                | "pause"
                | "restart"
                | "resume"
                | "status"
                | "undo";
              resourceType: "deployment" | "daemonset" | "statefulset";
              name: string;
              namespace?: string;
              revision?: number;
              toRevision?: number;
              timeout?: string;
              watch?: boolean;
            },
          );
        }

        if (name === "kubectl_generic") {
          return await kubectlGeneric(
            kubeconfigPath,
            input as {
              command: string;
              subCommand?: string;
              resourceType?: string;
              name?: string;
              namespace?: string;
              outputFormat?: string;
              flags?: Record<string, any>;
              args?: string[];
            },
          );
        }

        if (name === "kubectl_events") {
          return await kubectlGet(kubeconfigPath, {
            resourceType: "events",
            namespace: (input as { namespace?: string }).namespace,
            fieldSelector: (input as { fieldSelector?: string }).fieldSelector,
            labelSelector: (input as { labelSelector?: string }).labelSelector,
            sortBy: (input as { sortBy?: string }).sortBy,
            output: (input as { output?: string }).output,
          });
        }

        // Handle specific non-kubectl operations
        switch (name) {
          case "cleanup": {
            await k8sManager.cleanup();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "explain_resource": {
            return await explainResource(
              kubeconfigPath,
              input as {
                resource: string;
                apiVersion?: string;
                recursive?: boolean;
                output?: "plaintext" | "plaintext-openapiv2";
              },
            );
          }

          case "install_helm_chart": {
            return await installHelmChart(
              input as {
                name: string;
                chart: string;
                repo: string;
                namespace: string;
                values?: Record<string, any>;
              },
              kubeconfigPath,
            );
          }

          case "uninstall_helm_chart": {
            return await uninstallHelmChart(
              input as {
                name: string;
                namespace: string;
              },
              kubeconfigPath,
            );
          }

          case "upgrade_helm_chart": {
            return await upgradeHelmChart(
              input as {
                name: string;
                chart: string;
                repo: string;
                namespace: string;
                values?: Record<string, any>;
              },
              kubeconfigPath,
            );
          }

          case "list_api_resources": {
            return await listApiResources(
              kubeconfigPath,
              input as {
                apiGroup?: string;
                namespaced?: boolean;
                verbs?: string[];
                output?: "wide" | "name" | "no-headers";
              },
            );
          }

          case "port_forward": {
            return await startPortForward(
              k8sManager,
              input as {
                resourceType: string;
                resourceName: string;
                localPort: number;
                targetPort: number;
              },
            );
          }

          case "stop_port_forward": {
            return await stopPortForward(
              k8sManager,
              input as {
                id: string;
              },
            );
          }

          case "kubectl_scale": {
            return await kubectlScale(
              kubeconfigPath,
              input as {
                name: string;
                namespace?: string;
                replicas: number;
                resourceType?: string;
              },
            );
          }

          default:
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Unknown tool: ${name}`,
            );
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error}`,
        );
      }
    },
  );

  return server;
}

// Start the server
if (process.env.ENABLE_STREAMABLE_HTTP_TRANSPORT) {
  startStreamableHTTPServer(createServer);
  console.log(`Streamable HTTP server started`);

  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down...`);
      process.exit(0);
    });
  });
} else {
  const server = createServer();
  const transport = new StdioServerTransport();

  console.error(
    `Starting Kubernetes MCP server v${serverConfig.version}, handling commands...`,
  );

  server.connect(transport);

  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down...`);
      await server.close();
      process.exit(0);
    });
  });
}

export { allTools, destructiveTools };
