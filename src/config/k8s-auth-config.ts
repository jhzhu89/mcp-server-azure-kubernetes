export type CredentialType = "application" | "delegated";

export function getAuthMode(): "composite" {
  return "composite";
}

export function getKubeconfigCredentialType(): CredentialType {
  return (
    (process.env.KUBECONFIG_CREDENTIAL_TYPE as CredentialType) || "application"
  );
}

export function getAksTokenCredentialType(): CredentialType {
  return (
    (process.env.AKS_TOKEN_CREDENTIAL_TYPE as CredentialType) || "delegated"
  );
}
