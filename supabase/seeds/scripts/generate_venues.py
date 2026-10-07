#!/usr/bin/env python3
"""Regenerate supabase/seeds/production/03_venues.sql from BadmintonHub.

Source: the venue pages listed in https://www.badmintonhub.com.au/sitemap.xml.
Each page publishes the venue as schema.org structured data
(SportsActivityLocation: name, address, geo coordinates). Pages marked as a
SportsClub are clubs, not venues, and are skipped. robots.txt is respected and
pages are fetched one per second.

Use in production is pending BadmintonHub's permission (team item 8).

Pins that are missing, or known to be wrong, are looked up with OpenStreetMap's
Nominatim geocoder (free; one request per second; results may be stored with
the credit "(c) OpenStreetMap contributors", ODbL). A lookup is only kept if it
lands within MAX_KM of the venue's suburb centre; otherwise the pin stays empty
and the Google Maps link searches by name and address.

Usage (from the repo root):
    python3 supabase/seeds/scripts/generate_venues.py              # fetch (~3 min)
    python3 supabase/seeds/scripts/generate_venues.py --cache F.json  # reuse a saved fetch
    python3 supabase/seeds/scripts/generate_venues.py --save F.json   # fetch and keep a copy
"""

import argparse
import html
import json
import math
import pathlib
import re
import time
import urllib.parse
import urllib.request
import urllib.robotparser

SITE = "https://www.badmintonhub.com.au"
USER_AGENT = "BadmintonSocialConnect-dev/0.1 (university project)"
OUT = pathlib.Path(__file__).resolve().parents[1] / "production" / "03_venues.sql"
SUBURBS = pathlib.Path(__file__).resolve().parents[1] / "production" / "02_suburbs.sql"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
MAX_KM = 10

# Pins checked against our suburb data and found wrong. BadmintonHub's
# coordinates are dropped and Nominatim is asked instead.
BAD_PINS = {
    f"{SITE}/venues/43": "BadmintonHub latitude -36.777 is one degree south of Maribyrnong (-37.77); likely a typo",
}


def km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h))


def suburb_centres() -> dict:
    """(suburb lowercased, state) -> (lat, lng), from the suburbs seed."""
    centres = {}
    pattern = r"\('((?:[^']|'')*)', '\d{4}', '([A-Z]+)', (-?[\d.]+), (-?[\d.]+)\)"
    for name, state, lat, lng in re.findall(pattern, SUBURBS.read_text()):
        centres.setdefault((name.replace("''", "'").lower(), state), (float(lat), float(lng)))
    return centres


class Throttle:
    """At most one call per `interval` seconds, however quickly they arrive.

    Nominatim's usage policy allows one request per second at most. Each call
    waits until a full interval has passed since the previous one started.
    `clock` and `sleep` are swappable so the tests can use a fake clock.
    """

    def __init__(self, interval=1.0, clock=time.monotonic, sleep=time.sleep):
        self.interval, self.clock, self.sleep = interval, clock, sleep
        self.last = None

    def wait(self):
        if self.last is not None:
            remaining = self.interval - (self.clock() - self.last)
            if remaining > 0:
                self.sleep(remaining)
        self.last = self.clock()


NOMINATIM_THROTTLE = Throttle()


def in_australia(pin) -> bool:
    return -44.0 <= pin[0] <= -9.0 and 112.0 <= pin[1] <= 160.0


def nominatim(venue: dict, centres: dict, fetcher=None, throttle=None):
    """Look the venue up on OpenStreetMap. Returns (lat, lng) or None.

    Tries "name, street", then the street alone. A result is kept only if it
    is in Australia and within MAX_KM of the venue's suburb centre. Network
    or HTTP errors leave the pin empty rather than stopping the whole run.
    """
    fetcher = fetcher or fetch
    throttle = throttle or NOMINATIM_THROTTLE
    centre = centres.get(((venue["suburb"] or "").lower(), venue["state"]))

    for query in (f"{venue['name']}, {venue['street']}", venue["street"]):
        if not query:
            continue
        url = NOMINATIM + "?" + urllib.parse.urlencode(
            {"q": f"{query}, Australia", "format": "jsonv2", "limit": 1, "countrycodes": "au"})
        throttle.wait()
        try:
            results = json.loads(fetcher(url))
        except Exception as error:  # network, HTTP or a garbled reply
            print(f"nominatim: {venue['name']}: {error}")
            return None
        if not results:
            continue
        pin = (float(results[0]["lat"]), float(results[0]["lon"]))
        if not in_australia(pin):
            continue
        if centre is None or km(pin, centre) <= MAX_KM:
            return pin
    return None


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def collect() -> list[dict]:
    robots = urllib.robotparser.RobotFileParser(f"{SITE}/robots.txt")
    robots.read()
    urls = re.findall(r"<loc>([^<]*/venues/\d+)</loc>", fetch(f"{SITE}/sitemap.xml"))

    venues = []
    for url in urls:
        if not robots.can_fetch(USER_AGENT, url):
            continue
        page = fetch(url)
        time.sleep(1)
        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
            try:
                data = json.loads(block)
            except json.JSONDecodeError:
                continue
            if data.get("@type") != "SportsActivityLocation":
                continue
            address, geo = data.get("address", {}), data.get("geo", {})
            venues.append({
                "source_url": url,
                "name": html.unescape(data.get("name", "")).strip(),
                "street": address.get("streetAddress"),
                "suburb": address.get("addressLocality"),
                "state": address.get("addressRegion"),
                "postcode": address.get("postalCode"),
                "lat": geo.get("latitude"),
                "lng": geo.get("longitude"),
            })
            break
    return venues


def sql_text(value) -> str:
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def dedupe(venues: list[dict]) -> tuple[list[dict], list[str]]:
    """BadmintonHub lists a few venues twice (same name, suburb and pin).
    Keep one per (name, suburb, state): the listing with the fuller address."""
    groups: dict[tuple, list[dict]] = {}
    for v in venues:
        key = (v["name"].lower(), (v["suburb"] or "").lower(), v["state"])
        groups.setdefault(key, []).append(v)

    kept, dropped = [], []
    for listings in groups.values():
        listings.sort(key=lambda v: len(v["street"] or ""), reverse=True)
        kept.append(listings[0])
        dropped += [
            f"{v['source_url']} (duplicate of {listings[0]['source_url']}, {v['name']})"
            for v in listings[1:]
        ]
    return kept, dropped


def write_sql(venues: list[dict]) -> None:
    venues, duplicates = dedupe(venues)
    centres = suburb_centres()
    rows, looked_up, unresolved = [], [], []
    for v in sorted(venues, key=lambda x: (x["state"] or "", x["suburb"] or "", x["name"])):
        lat, lng, source = v["lat"], v["lng"], "badmintonhub"
        if v["source_url"] in BAD_PINS or lat is None:
            pin = nominatim(v, centres)
            if pin:
                (lat, lng), source = pin, "openstreetmap"
                looked_up.append(f"{v['source_url']} ({v['name']}): {lat:.6f}, {lng:.6f}")
            else:
                lat = lng = source = None
                unresolved.append(f"{v['source_url']} ({v['name']})")
        coords = f"{float(lat):.6f}, {float(lng):.6f}" if lat is not None else "null, null"
        rows.append(
            f"  ({sql_text(v['name'])}, {sql_text(v['street'])}, {sql_text(v['suburb'])}, "
            f"{sql_text(v['postcode'])}, {sql_text(v['state'])}, {coords}, "
            f"{sql_text(source)}, {sql_text(v['source_url'])})"
        )

    bad = "\n".join(f"--   {url}: {why}" for url, why in BAD_PINS.items())
    osm = "\n".join(f"--   {line}" for line in looked_up) or "--   none"
    missing = "\n".join(f"--   {line}" for line in unresolved) or "--   none"
    dups = "\n".join(f"--   {d}" for d in duplicates) or "--   none"
    sql = f"""-- Badminton venues across Australia. GENERATED FILE: do not edit by hand.
-- Regenerate with: python3 supabase/seeds/scripts/generate_venues.py
--
-- Source: BadmintonHub (badmintonhub.com.au) venue pages, collected from the
-- published structured data, respecting robots.txt. {len(rows)} venues.
-- Use in production is pending BadmintonHub's permission (team item 8).
--
-- Every pin was checked against the venue's suburb. BadmintonHub pins found wrong:
{bad}
--
-- Pins looked up with OpenStreetMap Nominatim instead (credit:
-- "(c) OpenStreetMap contributors", ODbL):
{osm}
--
-- No pin found (the Google Maps link searches by name and address):
{missing}
--
-- Listed twice by BadmintonHub; one copy kept:
{dups}
--
-- Safe to run repeatedly: a venue is matched on (name, suburb) and updated.
-- Suburbs match on name, postcode and state, or on name and state when the
-- listing's postcode differs from ours.

insert into public.venue (name, address, suburb_id, latitude, longitude, coordinates_source, source_url)
select v.name, v.street, s.suburb_id, v.lat, v.lng, v.coordinates_source, v.source_url
from (values
{",\n".join(rows)}
) as v (name, street, suburb, postcode, state, lat, lng, coordinates_source, source_url)
cross join lateral (
  select su.suburb_id
  from public.suburb su
  where lower(su.name) = lower(v.suburb) and su.state_code = v.state
  order by (su.postcode = v.postcode) desc, su.postcode
  limit 1
) s
on conflict (name, suburb_id) do update
  set address = excluded.address,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      coordinates_source = excluded.coordinates_source,
      source_url = excluded.source_url;

-- Every listed venue must have found its suburb; a silent drop would lose it.
do $$
begin
  if (select count(*) from public.venue where source_url like '{SITE}/venues/%') < {len(rows)} then
    raise exception 'venue seed: some venues did not match a suburb';
  end if;
end $$;
"""
    OUT.write_text(sql)
    print(f"wrote {len(rows)} venues to {OUT}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", help="read venues from this JSON instead of fetching")
    parser.add_argument("--save", help="save the fetched venues to this JSON")
    args = parser.parse_args()

    if args.cache:
        venues = json.loads(pathlib.Path(args.cache).read_text())
    else:
        venues = collect()
        if args.save:
            pathlib.Path(args.save).write_text(json.dumps(venues, indent=1))

    write_sql(venues)


if __name__ == "__main__":
    main()
