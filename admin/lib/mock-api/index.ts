/**
 * Public surface of the data layer. Pages import from here only, so replacing
 * the mock with Supabase means replacing this folder, not touching pages.
 */
export * from "./rpc";
export * from "./queries";
export { useDb, useQuery, useMockConfig } from "./hooks";
export { ApiError, isApiError } from "./errors";
export type { ApiErrorCode } from "./errors";
export { setMockConfig, hydrateMockConfig } from "./config";
export type { MockApiConfig } from "./config";
export { hydrateStore, resetStore } from "./store";
export * from "./analytics";
