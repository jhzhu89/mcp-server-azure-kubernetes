import {
  type AuthRequest,
  type ApplicationAuthRequest,
  type DelegatedAuthRequest,
} from "./types.js";

export interface RequestMapper<TSource, TOptions = void> {
  mapToAuthRequest(
    source: TSource,
    mode: "application" | "delegated",
  ): AuthRequest;
  mapToOptions?(source: TSource): TOptions;
}

export class McpRequestMapper implements RequestMapper<any> {
  mapToAuthRequest(
    request: any,
    mode: "application" | "delegated",
  ): AuthRequest {
    if (mode === "application") {
      return { mode: "application" } as ApplicationAuthRequest;
    } else {
      const accessToken = request.params?.arguments?.access_token;
      if (!accessToken) {
        throw new Error(
          "No access token provided in arguments. For delegated auth mode, you must provide 'access_token' in the tool arguments.",
        );
      }
      return { mode: "delegated", accessToken } as DelegatedAuthRequest;
    }
  }
}
