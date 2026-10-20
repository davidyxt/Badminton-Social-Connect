"use client";

/**
 * Knobs for the mock network, driven by the "Mock controls" dev panel.
 * Not part of the real API surface; delete with the rest of lib/mock-api.
 */
export interface MockApiConfig {
  /** Simulate 300-800ms latency on every call. */
  latency: boolean;
  /** Probability (0-1) that any mutating call fails with a network error. */
  failureRate: number;
  /** Fail the next mutating call, then reset. */
  failNext: boolean;
  /** Make the next mutating call hit a "record changed" conflict, then reset. */
  conflictNext: boolean;
  /** Periodically insert new pending reports to show the live queue. */
  liveReports: boolean;
}

const STORAGE_KEY = "bsc-admin:mock-config:v1";

const DEFAULT_CONFIG: MockApiConfig = {
  latency: true,
  failureRate: 0,
  failNext: false,
  conflictNext: false,
  liveReports: false,
};

let config: MockApiConfig = DEFAULT_CONFIG;
const listeners = new Set<() => void>();

export function getMockConfig(): MockApiConfig {
  return config;
}

export function getServerMockConfig(): MockApiConfig {
  return DEFAULT_CONFIG;
}

export function subscribeMockConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setMockConfig(patch: Partial<MockApiConfig>): void {
  config = { ...config, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Non-essential.
  }
  for (const l of listeners) l();
}

export function hydrateMockConfig(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) config = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<MockApiConfig>) };
  } catch {
    config = DEFAULT_CONFIG;
  }
  for (const l of listeners) l();
}
