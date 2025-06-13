# Advanced README for mcp-server-azure-kubernetes

## Azure Authentication

This server is specifically designed for Azure Kubernetes Service (AKS) with Azure AD authentication using the On-Behalf-Of (OBO) flow.

### Azure AD Application Setup

1. **Register an Azure AD Application** in your tenant
2. **Configure API Permissions**:
   - `https://management.azure.com/user_impersonation` (for ARM API access)
   - `6dae42f8-4368-4678-94ff-3960e28e3630/user.read` (for AKS dataplane access)
3. **Create a Client Secret** for the application
4. **Note down**:
   - Application (Client) ID
   - Directory (Tenant) ID
   - Client Secret

### Environment Variables for Azure Authentication

Set these environment variables for the server:

```bash
export AZURE_CLIENT_ID="your-azure-ad-app-client-id"
export AZURE_CLIENT_SECRET="your-azure-ad-app-client-secret"
export AZURE_TENANT_ID="your-azure-tenant-id"
```

### Client Authentication Flow

Clients must provide an Azure AD access token with the server's Azure AD application as the audience. The server will then use OBO flow to obtain the necessary tokens for ARM and AKS access.

#### Token Acquisition (Client Side)

```javascript
// Example using MSAL.js
const msalConfig = {
  auth: {
    clientId: "your-client-app-id",
    authority: "https://login.microsoftonline.com/your-tenant-id",
  },
};

const tokenRequest = {
  scopes: ["api://your-server-app-id/.default"], // Server's App ID
};

const response = await msalInstance.acquireTokenSilent(tokenRequest);
const accessToken = response.accessToken;
```

#### Token Usage

Include the token in your tool calls:

```json
{
  "name": "list_pods",
  "arguments": {
    "namespace": "default",
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIs..."
  }
}
```

Or set it as an HTTP header:

```http
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIs...
```

### Non-Destructive Mode

You can run the server in a non-destructive mode that disables all destructive operations (delete pods, delete deployments, delete namespaces, etc.) by setting the `ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS` environment variable to `true`:

```shell
ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS=true npx mcp-server-azure-kubernetes
```

This feature is particularly useful for:

- **Production environments**: Prevent accidental deletion or modification of critical resources
- **Shared clusters**: Allow multiple users to safely explore the cluster without risk of disruption
- **Educational settings**: Provide a safe environment for learning Kubernetes operations
- **Demonstration purposes**: Show cluster state and resources without modification risk

When enabled, the following destructive operations are disabled:

- `delete_pod`: Deleting pods
- `delete_deployment`: Deleting deployments
- `delete_namespace`: Deleting namespaces
- `uninstall_helm_chart`: Uninstalling Helm charts
- `delete_cronjob`: Deleting cronjobs
- `cleanup`: Cleaning up resources

All read-only operations like listing resources, describing pods, getting logs, etc. remain fully functional.

### Streamable HTTP Transport

To enable [Streamable HTTP transport]() for mcp-server-azure-kubernetes, use the ENABLE_STREMABLE_HTTP_TRANSPORT environment variable.

```shell
ENABLE_STREAMABLE_HTTP_TRANSPORT=1 npx jhzhu89/mcp-server-azure-kubernetes
```

This will start an http server with the `/mcp` endpoint for server-sent events. Use the `PORT` env var to configure the server port.

```shell
ENABLE_STREAMABLE_HTTP_TRANSPORT=1 PORT=3001 npx jhzhu89/mcp-server-azure-kubernetes
```

#### Documentation on Running Streamable HTTP Mode with Docker

Complete Example
Assuming your image name is jhzhu89/mcp-server-azure-kubernetes and you need to map ports and set environment parameters, you can run:

```shell
docker  run --rm -it -p 3001:3001 -e ENABLE_STREAMABLE_HTTP_TRANSPORT=1  -e PORT=3001 jhzhu89/mcp-server-azure-kubernetes
```
