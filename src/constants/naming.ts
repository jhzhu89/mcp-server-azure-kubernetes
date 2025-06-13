export const CACHE_KEY_SEPARATOR = ":";
export const FILE_NAME_SEPARATOR = "-";
export const KUBECONFIG_PREFIX = "kubeconfig";
export const AUDIT_LOG_PREFIX = "audit";
export const ERROR_LOG_PREFIX = "error";
export const TEMP_FILE_PREFIX = "temp";

export function buildCacheKey(type: string, ...segments: string[]): string {
  return [type, ...segments].join(CACHE_KEY_SEPARATOR);
}

export function buildFileName(prefix: string, ...segments: string[]): string {
  return [prefix, ...segments].join(FILE_NAME_SEPARATOR);
}

export function buildKubeconfigPath(tenantId: string, userObjectId: string, tokenHash: string): string {
  const fileName = buildFileName(
    KUBECONFIG_PREFIX,
    tenantId.slice(-8),
    userObjectId.slice(-8),
    tokenHash.slice(0, 8)
  );
  return `/dev/shm/${fileName}`;
}
