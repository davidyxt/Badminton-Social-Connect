"use client";

import { IS_API } from "@/lib/config";
import { createEmptyDb, createInitialDb } from "@/lib/mock-data";
import type { MockDatabase } from "@/lib/types";

/**
 * The single in-memory source of truth for every admin screen.
 *
 * Writes are immutable (each commit produces a new top-level object) so React's
 * useSyncExternalStore picks up changes everywhere at once: suspending a player
 * on their profile updates the directory, report detail and activity log
 * without a refresh. The store is mirrored to localStorage so a page reload
 * keeps the demo state, and other tabs pick up changes through the `storage`
 * event (which also makes the "record changed" conflict reproducible for real).
 *
 * In API mode the store is a read cache filled by lib/api/sync.ts and is never
 * written to localStorage.
 */

const STORAGE_KEY = "bsc-admin:mock-db:v3";

let db: MockDatabase = IS_API ? createEmptyDb() : createInitialDb();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  if (IS_API) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage can be unavailable (private mode, quota); the in-memory store still works.
  }
}

export function getDb(): MockDatabase {
  return db;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply a mutation and notify every subscriber. */
export function commit(mutate: (current: MockDatabase) => MockDatabase): void {
  db = mutate(db);
  persist();
  emit();
}

let hydrated = false;

/** Load persisted state once on the client and start listening to other tabs. */
export function hydrateStore(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  if (IS_API) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) db = { ...createInitialDb(), ...(JSON.parse(raw) as Partial<MockDatabase>) };
  } catch {
    db = createInitialDb();
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      db = JSON.parse(e.newValue) as MockDatabase;
      emit();
    } catch {
      // Ignore malformed writes from other tabs.
    }
  });
  emit();
}

export function resetStore(): void {
  commit(() => createInitialDb());
}

/** Small immutable helpers used by the mock RPCs. */
export function replaceWhere<T>(rows: T[], match: (row: T) => boolean, update: (row: T) => T): T[] {
  return rows.map((row) => (match(row) ? update(row) : row));
}
