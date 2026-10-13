// Venue pin look-ups with OpenStreetMap Nominatim.
//
// The same rules as supabase/seeds/scripts/generate_venues.py:
//   * ask "name, address", then the address alone;
//   * keep a result only if it is in Australia and within MAX_KM of the
//     venue's suburb centre;
//   * at most one request per second (Nominatim usage policy);
//   * a network or HTTP error leaves the pin empty rather than failing.
// Results may be stored with the credit "(c) OpenStreetMap contributors"
// (ODbL); venues record coordinates_source = 'openstreetmap'.

export const NOMINATIM = "https://nominatim.openstreetmap.org/search";
export const MAX_KM = 10;
export const USER_AGENT = "BadmintonSocialConnect/0.1 (university project)";

export type Venue = {
  name: string;
  address: string | null;
  suburb: string | null;
  state: string | null;
  suburbLat: number | null;
  suburbLng: number | null;
};

export type Pin = { lat: number; lng: number };
export type LookupResult = { pin: Pin | null; error?: string };
export type Fetcher = (url: string) => Promise<Array<{ lat: string; lon: string }>>;

export function km(a: Pin, b: Pin): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function inAustralia(pin: Pin): boolean {
  return pin.lat >= -44 && pin.lat <= -9 && pin.lng >= 112 && pin.lng <= 160;
}

// At most one call per interval, however quickly they arrive. The clock and
// sleep are swappable so the tests can use a fake clock.
export class Throttle {
  private last: number | null = null;

  constructor(
    private readonly intervalMs = 1000,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async wait(): Promise<void> {
    if (this.last !== null) {
      const remaining = this.intervalMs - (this.now() - this.last);
      if (remaining > 0) await this.sleep(remaining);
    }
    this.last = this.now();
  }
}

export const nominatimFetcher: Fetcher = async (url) => {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  return await response.json();
};

export function searchUrl(query: string): string {
  const params = new URLSearchParams({
    q: `${query}, Australia`,
    format: "jsonv2",
    limit: "1",
    countrycodes: "au",
  });
  return `${NOMINATIM}?${params}`;
}

export async function lookup(
  venue: Venue,
  throttle: Throttle,
  fetcher: Fetcher = nominatimFetcher,
): Promise<LookupResult> {
  const centre = venue.suburbLat !== null && venue.suburbLng !== null
    ? { lat: Number(venue.suburbLat), lng: Number(venue.suburbLng) }
    : null;

  const queries = [
    venue.address ? `${venue.name}, ${venue.address}` : venue.name,
    venue.address,
  ].filter((q): q is string => Boolean(q));

  for (const query of queries) {
    await throttle.wait();
    let results;
    try {
      results = await fetcher(searchUrl(query));
    } catch (error) {
      return { pin: null, error: String(error instanceof Error ? error.message : error) };
    }
    if (!results?.length) continue;

    const pin = { lat: Number(results[0].lat), lng: Number(results[0].lon) };
    if (!inAustralia(pin)) continue;
    if (centre === null || km(pin, centre) <= MAX_KM) return { pin };
  }
  return { pin: null };
}
