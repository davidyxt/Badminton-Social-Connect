#!/usr/bin/env python3
"""Regenerate supabase/seeds/production/02_suburbs.sql from GeoNames.

Source: GeoNames postal codes for Australia, https://download.geonames.org/export/zip/AU.zip
Licence: Creative Commons Attribution 4.0. Credit GeoNames wherever suburb data
is shown (https://www.geonames.org).

Usage (from the repo root):
    python3 supabase/seeds/scripts/generate_suburbs.py

The output is an upsert, so it is safe to load again on every deploy. Suburbs
that disappear from the source are not deleted: venues and posts may point at
them.
"""

import csv
import io
import pathlib
import urllib.request
import zipfile

SOURCE_URL = "https://download.geonames.org/export/zip/AU.zip"
OUT = pathlib.Path(__file__).resolve().parents[1] / "production" / "02_suburbs.sql"
BATCH = 1000

# Postcode ranges Australia Post reserves for PO boxes and large-volume
# receivers. Nobody lives or plays badminton in them, and they would show up
# as duplicate suburbs in the picker (Melbourne alone has 13 of them).
MAIL_ONLY = {
    "NSW": (1000, 1999),
    "ACT": (200, 299),
    "VIC": (8000, 8999),
    "QLD": (9000, 9999),
    "SA": (5800, 5999),
    "WA": (6800, 6999),
    "TAS": (7800, 7999),
    "NT": (900, 999),
}
STATES = set(MAIL_ONLY)


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    with urllib.request.urlopen(SOURCE_URL) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    text = archive.read("AU.txt").decode("utf-8")

    rows = {}
    for record in csv.reader(io.StringIO(text), delimiter="\t"):
        postcode, name, state = record[1].zfill(4), record[2].strip(), record[4]
        if state not in STATES:
            continue
        low, high = MAIL_ONLY[state]
        if low <= int(postcode) <= high:
            continue
        key = (name, postcode, state)
        if key not in rows:
            rows[key] = (round(float(record[9]), 5), round(float(record[10]), 5))

    ordered = sorted(rows.items(), key=lambda item: (item[0][2], item[0][0], item[0][1]))

    lines = [
        "-- Australian suburbs and postcodes. GENERATED FILE: do not edit by hand.",
        "-- Regenerate with: python3 supabase/seeds/scripts/generate_suburbs.py",
        "--",
        "-- Source: GeoNames postal codes (https://www.geonames.org), licensed under",
        "-- Creative Commons Attribution 4.0. Mail-only postcode ranges are excluded.",
        f"-- {len(ordered)} rows.",
        "",
    ]
    for start in range(0, len(ordered), BATCH):
        chunk = ordered[start:start + BATCH]
        lines.append("insert into public.suburb (name, postcode, state_code, latitude, longitude) values")
        values = [
            f"  ({sql_text(name)}, '{postcode}', '{state}', {lat}, {lng})"
            for (name, postcode, state), (lat, lng) in chunk
        ]
        lines.append(",\n".join(values))
        lines.append("on conflict (name, postcode, state_code) do update")
        lines.append("  set latitude = excluded.latitude, longitude = excluded.longitude;")
        lines.append("")

    OUT.write_text("\n".join(lines))
    print(f"wrote {len(ordered)} suburbs to {OUT}")


if __name__ == "__main__":
    main()
