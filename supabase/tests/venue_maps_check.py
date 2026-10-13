#!/usr/bin/env python3
"""Check every venue's Google Maps link opens, and every pin is where it should be.

For each venue in the local database (after `npx supabase db reset`):
  1. maps_url is a Google Maps search link;
  2. the pin, if any, is inside Australia and within MAX_KM of the venue's
     suburb centre (catches typos like a latitude one degree out);
  3. Google answers the link with a map page (HTTP 200 on a google.* page).

Step 3 makes one request per venue, one per second (about 2.5 minutes for
142 venues). Run it after regenerating supabase/seeds/production/03_venues.sql:

    python3 supabase/tests/venue_maps_check.py            # all checks
    python3 supabase/tests/venue_maps_check.py --offline  # skip step 3

Exits non-zero if anything fails.
"""

import argparse
import json
import math
import subprocess
import sys
import time
import urllib.request

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
MAX_KM = 10
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15"
)

# Pins known to sit further than MAX_KM from our suburb centre because our
# suburb data (GeoNames) is wrong, not the venue. Checked by hand.
SUBURB_DATA_WRONG = {
    "BadmintonWorx Norwest": "GeoNames puts Norwest NSW 2153 near Picton; the venue pin is correct",
}

QUERY = """
select coalesce(json_agg(json_build_object(
  'name', v.name, 'maps_url', v.maps_url,
  'lat', v.latitude, 'lng', v.longitude,
  'suburb', s.name, 'suburb_lat', s.latitude, 'suburb_lng', s.longitude
) order by v.name), '[]')
from public.venue v join public.suburb s using (suburb_id);
"""


def km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h))


def opens_in_google_maps(url):
    request = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.status == 200 and "google." in response.geturl()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="skip requesting Google")
    args = parser.parse_args()

    raw = subprocess.run(["psql", DB_URL, "-At", "-c", QUERY],
                         capture_output=True, text=True, check=True).stdout
    venues = json.loads(raw)
    failures = []

    for v in venues:
        name = v["name"]
        if not (v["maps_url"] or "").startswith("https://www.google.com/maps/search/?api=1&query="):
            failures.append(f"{name}: maps_url is not a Google Maps link")
            continue

        if v["lat"] is not None:
            pin = (float(v["lat"]), float(v["lng"]))
            if not (-44 <= pin[0] <= -9 and 112 <= pin[1] <= 160):
                failures.append(f"{name}: pin {pin} is outside Australia")
            elif v["suburb_lat"] is not None and name not in SUBURB_DATA_WRONG:
                distance = km(pin, (float(v["suburb_lat"]), float(v["suburb_lng"])))
                if distance > MAX_KM:
                    failures.append(f"{name}: pin is {distance:.1f} km from {v['suburb']}")

        if not args.offline:
            try:
                if not opens_in_google_maps(v["maps_url"]):
                    failures.append(f"{name}: Google did not return a map page")
            except Exception as error:  # network, HTTP error
                failures.append(f"{name}: {error}")
            time.sleep(1)

    with_pin = sum(1 for v in venues if v["lat"] is not None)
    print(f"{len(venues)} venues, {with_pin} with a pin, "
          f"{len(venues) - with_pin} searched by name and address")
    print(f"{len(venues) - len(failures)} passed, {len(failures)} failed"
          + (" (Google not contacted)" if args.offline else ""))
    for failure in failures:
        print("  FAIL", failure)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
