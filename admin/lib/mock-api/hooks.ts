"use client";

import { useSyncExternalStore } from "react";
import type { MockDatabase } from "@/lib/types";
import { getMockConfig, getServerMockConfig, subscribeMockConfig } from "./config";
import { getDb, subscribe } from "./store";

/**
 * Live view of the store. Re-renders whenever any admin action commits, which
 * stands in for the Supabase Realtime channels (admin:reports, admin:activity_log).
 */
export function useDb(): MockDatabase {
  return useSyncExternalStore(subscribe, getDb, getDb);
}

/**
 * Run a selector against the live store. Selectors are cheap array scans over
 * small fixtures, so they simply re-run on each render.
 */
export function useQuery<T>(selector: (db: MockDatabase) => T): T {
  return selector(useDb());
}

export function useMockConfig() {
  return useSyncExternalStore(subscribeMockConfig, getMockConfig, getServerMockConfig);
}
