#!/usr/bin/env python3
"""Fill the LOCAL database with a realistic amount of mock data for every case.

    python3 supabase/seeds/scripts/mock_data.py                # about 150 players, 300 games
    python3 supabase/seeds/scripts/mock_data.py --players 50 --games 80
    python3 supabase/seeds/scripts/mock_data.py --players 500 --games 1500 --seed 7

It always starts clean: `npx supabase db reset` (migrations and the dev seed),
then supabase/seeds/scripts/mock_data.sql adds the mock data on top. The same
--seed gives the same data every time.

Mock accounts are mock001@example.com, mock002@example.com, ... with the dev
password Passw0rd!. At the end it prints what is in the database and which
accounts to sign in as for each case (a result to confirm, an invitation,
the top of the leaderboard, ...).

Local only: it refuses to run unless `npx supabase status` points at
127.0.0.1 or localhost. psql is used when installed, otherwise the psql inside
the local database container.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SQL = Path(__file__).with_name("mock_data.sql")


def local_db_url():
    try:
        out = subprocess.run(["npx", "--no-install", "supabase", "status", "-o", "json"],
                             capture_output=True, text=True, cwd=ROOT, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        sys.exit("The local Supabase stack is not running. Start it with `npx supabase start`.")
    url = json.loads(out[out.index("{"):])["DB_URL"]
    if not re.match(r"^postgres(ql)?://[^@]+@(127\.0\.0\.1|localhost)(:\d+)?/", url):
        sys.exit(f"Refusing to run: {url} is not the local database.")
    return url


def psql_command(url):
    if shutil.which("psql"):
        return ["psql", url]
    project = re.search(r'^project_id\s*=\s*"([^"]+)"', (ROOT / "supabase" / "config.toml").read_text(), re.M)
    if not project:
        sys.exit("psql is not installed and supabase/config.toml has no project_id.")
    return ["docker", "exec", "-i", f"supabase_db_{project.group(1)}", "psql", "-U", "postgres"]


def main():
    ap = argparse.ArgumentParser(description="Reset the local database and fill it with mock data.")
    ap.add_argument("--players", type=int, default=150, help="mock players to add (default 150)")
    ap.add_argument("--games", type=int, default=300,
                    help="games to add, 60%% past and 40%% upcoming (default 300)")
    ap.add_argument("--seed", type=int, default=42, help="random seed; the same seed gives the same data")
    args = ap.parse_args()

    if not 20 <= args.players <= 2000:
        sys.exit("--players must be between 20 and 2000.")
    if not 10 <= args.games <= 5000:
        sys.exit("--games must be between 10 and 5000.")

    url = local_db_url()
    psql = psql_command(url)

    print("Resetting the local database (npx supabase db reset) ...", flush=True)
    started = time.time()
    subprocess.run(["npx", "--no-install", "supabase", "db", "reset"], cwd=ROOT, check=True)

    # setseed() takes a number between -1 and 1.
    seed = (args.seed % 1999) / 1000.0 - 0.999
    print(f"\nAdding mock data: {args.players} players, {args.games} games, seed {args.seed} ...", flush=True)
    result = subprocess.run(
        psql + ["-q", "-v", "ON_ERROR_STOP=1",
                "-v", f"players={args.players}", "-v", f"games={args.games}", "-v", f"seed={seed}"],
        input=SQL.read_text(), text=True, cwd=ROOT)
    if result.returncode:
        sys.exit("Mock data failed (see above). The database has the dev seed only; run again after fixing.")

    print(f"\nDone in {time.time() - started:.0f} s.")


if __name__ == "__main__":
    main()
