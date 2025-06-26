export enum MultiTenantErrorCode {
  UNAUTHORIZED_SUBSCRIPTION = "UNAUTHORIZED_SUBSCRIPTION",
  INVALID_CLUSTER_ACCESS = "INVALID_CLUSTER_ACCESS",
  TOKEN_ACQUISITION_FAILED = "TOKEN_ACQUISITION_FAILED",
  TENANT_BOUNDARY_VIOLATION = "TENANT_BOUNDARY_VIOLATION",
  KUBECONFIG_GENERATION_FAILED = "KUBECONFIG_GENERATION_FAILED",
  JWT_VALIDATION_FAILED = "JWT_VALIDATION_FAILED",
  AZURE_OBO_FAILED = "AZURE_OBO_FAILED",
  TEMP_FILE_CREATION_FAILED = "TEMP_FILE_CREATION_FAILED",
}

export class MultiTenantError extends Error {
  constructor(
    public code: MultiTenantErrorCode,
    message: string,
    public userObjectId?: string,
    public tenantId?: string,
    public correlationId?: string,
  ) {
    super(message);
    this.name = "MultiTenantError";
  }

  toPublicMessage(): string {
    switch (this.code) {
      case MultiTenantErrorCode.UNAUTHORIZED_SUBSCRIPTION:
        return "Access denied to the specified subscription";
      case MultiTenantErrorCode.INVALID_CLUSTER_ACCESS:
        return "Access denied to the specified cluster";
      case MultiTenantErrorCode.TOKEN_ACQUISITION_FAILED:
        return "Authentication failed";
      case MultiTenantErrorCode.TENANT_BOUNDARY_VIOLATION:
        return "Operation not allowed across tenant boundaries";
      case MultiTenantErrorCode.KUBECONFIG_GENERATION_FAILED:
        return "Failed to configure cluster access";
      case MultiTenantErrorCode.JWT_VALIDATION_FAILED:
        return "Invalid authentication token";
      case MultiTenantErrorCode.AZURE_OBO_FAILED:
        return "Azure authentication failed";
      case MultiTenantErrorCode.TEMP_FILE_CREATION_FAILED:
        return "System configuration error";
      default:
        return "An error occurred while processing your request";
    }
  }
}
