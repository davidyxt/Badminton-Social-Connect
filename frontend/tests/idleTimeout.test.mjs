// Run with: node --test frontend/tests/idleTimeout.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  LAST_ACTIVITY_KEY,
  clearLastActivity,
  isIdleExpired,
  readLastActivity,
  saveLastActivity,
  shouldSaveActivity,
} from "../src/utils/idleTimeout.js";

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const throwingStorage = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); },
};

test("no record is never idle", () => {
  assert.equal(isIdleExpired(null, Date.now(), WEEK), false);
});

test("idle just under the timeout stays signed in", () => {
  assert.equal(isIdleExpired(1000, 1000 + WEEK, WEEK), false);
});

test("idle past the timeout expires", () => {
  assert.equal(isIdleExpired(1000, 1000 + WEEK + 1, WEEK), true);
  assert.equal(isIdleExpired(1000, 1000 + 30 * DAY, WEEK), true);
});

test("save, read and clear round-trip", () => {
  const s = memoryStorage();
  assert.equal(readLastActivity(s), null);
  saveLastActivity(s, 12345);
  assert.equal(readLastActivity(s), 12345);
  clearLastActivity(s);
  assert.equal(readLastActivity(s), null);
});

test("garbage in storage reads as no record", () => {
  const s = memoryStorage();
  for (const bad of ["abc", "", "-5", "0", "NaN"]) {
    s.setItem(LAST_ACTIVITY_KEY, bad);
    assert.equal(readLastActivity(s), null, `value ${JSON.stringify(bad)}`);
  }
});

test("missing or blocked storage never throws", () => {
  assert.equal(readLastActivity(null), null);
  assert.doesNotThrow(() => saveLastActivity(null, 1));
  assert.doesNotThrow(() => clearLastActivity(null));
  assert.equal(readLastActivity(throwingStorage), null);
  assert.doesNotThrow(() => saveLastActivity(throwingStorage, 1));
  assert.doesNotThrow(() => clearLastActivity(throwingStorage));
});

test("activity saves are throttled", () => {
  const minute = 60 * 1000;
  assert.equal(shouldSaveActivity(null, 5, minute), true);
  assert.equal(shouldSaveActivity(1000, 1000 + minute - 1, minute), false);
  assert.equal(shouldSaveActivity(1000, 1000 + minute, minute), true);
});
