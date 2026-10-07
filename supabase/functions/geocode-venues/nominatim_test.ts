// Offline tests for the Nominatim look-up rules. Nothing is sent to
// Nominatim: every test uses fake replies and a fake clock.
//
//   npx deno test supabase/functions/geocode-venues/nominatim_test.ts

import { inAustralia, lookup, searchUrl, Throttle, USER_AGENT, type Venue } from "./nominatim.ts";
import { nominatimFetcher } from "./nominatim.ts";

function assertEquals(actual: unknown, expected: unknown, note = "") {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${note} expected ${e}, got ${a}`);
}
function assert(condition: unknown, note: string) {
  if (!condition) throw new Error(note);
}

// Maribyrnong VIC, as the queue hands it to the function.
const COLLEGE: Venue = {
  name: "Maribyrnong College / Play Badminton",
  address: "Maribyrnong College, River Street, Maribyrnong VIC 3032",
  suburb: "Maribyrnong",
  state: "VIC",
  suburbLat: -37.7724,
  suburbLng: 144.8844,
};

class FakeClock {
  t = 0;
  slept: number[] = [];
  now = () => this.t;
  sleep = (ms: number) => {
    this.slept.push(ms);
    this.t += ms;
    return Promise.resolve();
  };
}

const place = (lat: number, lng: number) => ({ lat: String(lat), lon: String(lng) });

function fakeFetcher(replies: Array<unknown>) {
  const asked: string[] = [];
  const queue = [...replies];
  const fetcher = (url: string) => {
    asked.push(url);
    const next = queue.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next as never);
  };
  return { fetcher, asked };
}

const throttle = () => {
  const clock = new FakeClock();
  return { clock, throttle: new Throttle(1000, clock.now, clock.sleep) };
};

Deno.test("01 a match near the suburb is kept", async () => {
  const { fetcher, asked } = fakeFetcher([[place(-37.778024, 144.88905)]]);
  const result = await lookup(COLLEGE, throttle().throttle, fetcher);
  assertEquals(result.pin, { lat: -37.778024, lng: 144.88905 });
  assertEquals(asked.length, 1);
});

Deno.test("02 falls back to the address when the name finds nothing", async () => {
  const { fetcher, asked } = fakeFetcher([[], [place(-37.7801401, 144.8913699)]]);
  const result = await lookup(COLLEGE, throttle().throttle, fetcher);
  assertEquals(result.pin, { lat: -37.7801401, lng: 144.8913699 });
  assertEquals(asked.length, 2);
  assert(!asked[1].includes("Play+Badminton"), "second query should be the address only");
});

Deno.test("03 a match ~110 km away (Bendigo) is rejected", async () => {
  const { fetcher } = fakeFetcher([[place(-36.757, 144.279)], [place(-36.757, 144.279)]]);
  const result = await lookup(COLLEGE, throttle().throttle, fetcher);
  assertEquals(result.pin, null);
});

Deno.test("04 no match leaves the pin empty", async () => {
  const { fetcher, asked } = fakeFetcher([[], []]);
  const result = await lookup(COLLEGE, throttle().throttle, fetcher);
  assertEquals(result, { pin: null });
  assertEquals(asked.length, 2);
});

Deno.test("05 a network error leaves the pin empty and reports it", async () => {
  const { fetcher, asked } = fakeFetcher([new Error("timed out")]);
  const result = await lookup(COLLEGE, throttle().throttle, fetcher);
  assertEquals(result, { pin: null, error: "timed out" });
  assertEquals(asked.length, 1);
});

Deno.test("06 a result outside Australia is rejected even with no suburb centre", async () => {
  const venue = { ...COLLEGE, suburbLat: null, suburbLng: null };
  const { fetcher } = fakeFetcher([[place(51.5, -0.12)], [place(51.5, -0.12)]]);
  const result = await lookup(venue, throttle().throttle, fetcher);
  assertEquals(result.pin, null);
  assert(!inAustralia({ lat: 51.5, lng: -0.12 }), "London is not in Australia");
});

Deno.test("07 requests identify the app and stay in Australia", async () => {
  const realFetch = globalThis.fetch;
  let seen: { url: string; agent: string | null } | null = null;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    seen = { url, agent: new Headers(init?.headers).get("User-Agent") };
    return Promise.resolve(new Response(JSON.stringify([place(-37.778, 144.889)])));
  }) as typeof fetch;
  try {
    await lookup(COLLEGE, throttle().throttle, nominatimFetcher);
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(seen!.agent, USER_AGENT);
  assert(seen!.url.includes("countrycodes=au"), "must limit to Australia");
  assert(seen!.url.startsWith("https://nominatim.openstreetmap.org/search?"), "must call Nominatim");
  assertEquals(searchUrl("x").includes("format=jsonv2"), true);
});

Deno.test("08 a burst of 10 look-ups (20 requests) goes out one second apart", async () => {
  const { clock, throttle: t } = throttle();
  const sentAt: number[] = [];
  const fetcher = () => {
    sentAt.push(clock.t);
    return Promise.resolve([] as never); // nothing found: two requests each
  };
  // Fired back to back, as fast as possible.
  for (let i = 0; i < 10; i++) await lookup(COLLEGE, t, fetcher);

  assertEquals(sentAt.length, 20);
  const gaps = sentAt.slice(1).map((time, i) => time - sentAt[i]);
  assert(gaps.every((gap) => gap >= 1000), `gaps must be >= 1000 ms: ${gaps}`);
  assert(sentAt[19] - sentAt[0] >= 19000, "20 requests take at least 19 s");
});

Deno.test("09 no extra wait when a second has already passed", async () => {
  const clock = new FakeClock();
  const t = new Throttle(1000, clock.now, clock.sleep);
  await t.wait();
  clock.t += 5000; // other work took five seconds
  await t.wait();
  assertEquals(clock.slept, []);
});

Deno.test("10 a venue with no address is looked up by name alone, once", async () => {
  const venue = { ...COLLEGE, address: null };
  const { fetcher, asked } = fakeFetcher([[place(-37.778, 144.889)]]);
  const result = await lookup(venue, throttle().throttle, fetcher);
  assertEquals(result.pin, { lat: -37.778, lng: 144.889 });
  assertEquals(asked.length, 1);
  assert(asked[0].includes("Maribyrnong+College"), "queries the name");
});
