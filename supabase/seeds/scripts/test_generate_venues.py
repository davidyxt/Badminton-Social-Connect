"""Offline tests for the Nominatim look-ups in generate_venues.py.

Nominatim is never contacted: every test passes fake replies and a fake clock.
Run from the repo root:

    python3 -m unittest supabase/seeds/scripts/test_generate_venues.py -v
"""

import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("generate_venues", HERE / "generate_venues.py")
gv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gv)

# Maribyrnong VIC: suburb centre and a real point inside it.
CENTRES = {("maribyrnong", "VIC"): (-37.7724, 144.8844)}
COLLEGE = {
    "name": "Maribyrnong College / Play Badminton",
    "street": "Maribyrnong College, River Street, Maribyrnong VIC 3032",
    "suburb": "Maribyrnong", "state": "VIC", "postcode": "3032",
    "lat": None, "lng": None, "source_url": "https://www.badmintonhub.com.au/venues/43",
}


class FakeClock:
    """A clock that only moves when something sleeps."""

    def __init__(self):
        self.now = 0.0
        self.slept = []

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


def reply(*places):
    return json.dumps([{"lat": str(lat), "lon": str(lng)} for lat, lng in places])


def fresh_throttle(clock):
    return gv.Throttle(interval=1.0, clock=clock.clock, sleep=clock.sleep)


class NominatimLookupTests(unittest.TestCase):

    def lookup(self, replies, venue=COLLEGE, centres=CENTRES):
        """Run one look-up against canned replies; return (pin, urls asked)."""
        asked = []
        queue = list(replies)

        def fetcher(url):
            asked.append(url)
            item = queue.pop(0)
            if isinstance(item, Exception):
                raise item
            return item

        pin = gv.nominatim(venue, centres, fetcher=fetcher, throttle=fresh_throttle(FakeClock()))
        return pin, asked

    def test_01_found_near_the_suburb_is_kept(self):
        pin, asked = self.lookup([reply((-37.778024, 144.889050))])
        self.assertEqual(pin, (-37.778024, 144.889050))
        self.assertEqual(len(asked), 1)

    def test_02_falls_back_to_the_street_when_the_name_finds_nothing(self):
        pin, asked = self.lookup([reply(), reply((-37.7801401, 144.8913699))])
        self.assertEqual(pin, (-37.7801401, 144.8913699))
        self.assertEqual(len(asked), 2)
        self.assertNotIn("Play+Badminton", asked[1])

    def test_03_result_too_far_from_the_suburb_is_rejected(self):
        # Bendigo is about 110 km from Maribyrnong: both queries land there.
        pin, _ = self.lookup([reply((-36.757, 144.279)), reply((-36.757, 144.279))])
        self.assertIsNone(pin)

    def test_04_no_results_leaves_the_pin_empty(self):
        pin, asked = self.lookup([reply(), reply()])
        self.assertIsNone(pin)
        self.assertEqual(len(asked), 2)

    def test_05_network_error_leaves_the_pin_empty_instead_of_stopping(self):
        with mock.patch("builtins.print"):
            pin, asked = self.lookup([TimeoutError("timed out")])
        self.assertIsNone(pin)
        self.assertEqual(len(asked), 1)

    def test_06_result_outside_australia_is_rejected_even_with_no_suburb_centre(self):
        venue = dict(COLLEGE, suburb="Nowhere")  # no centre to compare against
        pin, _ = self.lookup([reply((51.5, -0.12)), reply((51.5, -0.12))], venue=venue)
        self.assertIsNone(pin)

    def test_07_requests_identify_the_app_and_stay_in_australia(self):
        seen = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def read(self):
                return reply((-37.778, 144.889)).encode()

        def fake_urlopen(request, timeout):
            seen["agent"] = request.get_header("User-agent")
            seen["url"] = request.full_url
            return FakeResponse()

        with mock.patch.object(gv.urllib.request, "urlopen", fake_urlopen):
            gv.nominatim(COLLEGE, CENTRES, throttle=fresh_throttle(FakeClock()))
        self.assertEqual(seen["agent"], gv.USER_AGENT)
        self.assertIn("countrycodes=au", seen["url"])
        self.assertIn("nominatim.openstreetmap.org", seen["url"])


class ThrottleTests(unittest.TestCase):

    def test_08_a_burst_of_lookups_goes_out_one_second_apart(self):
        # Ten look-ups fired back to back, each needing both queries: 20
        # requests that would all land in the same instant without a throttle.
        clock = FakeClock()
        throttle = fresh_throttle(clock)
        sent_at = []

        def fetcher(url):
            sent_at.append(clock.now)
            return reply()  # nothing found, so each venue asks twice

        for _ in range(10):
            gv.nominatim(COLLEGE, CENTRES, fetcher=fetcher, throttle=throttle)

        self.assertEqual(len(sent_at), 20)
        gaps = [later - earlier for earlier, later in zip(sent_at, sent_at[1:])]
        self.assertTrue(all(gap >= 1.0 for gap in gaps), gaps)
        self.assertGreaterEqual(sent_at[-1] - sent_at[0], 19.0)

    def test_09_no_extra_wait_when_a_second_has_already_passed(self):
        clock = FakeClock()
        throttle = fresh_throttle(clock)
        throttle.wait()
        clock.now += 5  # some other work took five seconds
        throttle.wait()
        self.assertEqual(clock.slept, [])


class SeedFileTests(unittest.TestCase):

    def test_10_only_missing_or_bad_pins_are_looked_up_and_recorded(self):
        good = dict(COLLEGE, name="Good Pin Hall", lat=-37.77, lng=144.88,
                    source_url="https://www.badmintonhub.com.au/venues/1")
        missing = dict(COLLEGE, name="No Pin Hall", source_url="https://www.badmintonhub.com.au/venues/2")
        bad = dict(COLLEGE, lat=-36.777, lng=144.8965)  # venues/43 is in BAD_PINS
        unfindable = dict(COLLEGE, name="Lost Hall", source_url="https://www.badmintonhub.com.au/venues/3")

        answers = {"No Pin Hall": (-37.775, 144.885), COLLEGE["name"]: (-37.778024, 144.889050),
                   "Lost Hall": None}
        looked_up = []

        def fake_nominatim(venue, centres):
            looked_up.append(venue["name"])
            return answers[venue["name"]]

        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "03_venues.sql"
            with mock.patch.object(gv, "OUT", out), \
                 mock.patch.object(gv, "suburb_centres", lambda: CENTRES), \
                 mock.patch.object(gv, "nominatim", fake_nominatim), \
                 mock.patch("builtins.print"):
                gv.write_sql([good, missing, bad, unfindable])
            sql = out.read_text()

        self.assertCountEqual(looked_up, ["No Pin Hall", COLLEGE["name"], "Lost Hall"])
        self.assertIn("'Good Pin Hall'", sql)
        self.assertIn("-37.770000, 144.880000, 'badmintonhub'", sql)
        self.assertIn("-37.778024, 144.889050, 'openstreetmap'", sql)
        self.assertIn("'Lost Hall', 'Maribyrnong College, River Street, Maribyrnong VIC 3032', "
                      "'Maribyrnong', '3032', 'VIC', null, null, null", sql)
        header = sql.split("insert into")[0]
        self.assertIn("venues/3 (Lost Hall)", header.split("No pin found")[1])


if __name__ == "__main__":
    unittest.main()
