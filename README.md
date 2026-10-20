# Badminton Social Connect

Badminton Social Connect player application, Supabase backend and integrated Admin web console.

This integrated version combines main `e42beb7`, our Admin integration and frontend `admin-console-frontend` at `5b204e7`. It includes the Admin console and its optional connection to the Admin API on the Player BE-2 0.4 database baseline (50 migrations), including the existing shared singles rating engine. Local verification does not establish hosted deployment.

## Structure

- `frontend/` — React frontend (player app)
- `admin/` — Admin web console (Next.js, mock or integrated Admin API mode; see [admin/README.md](admin/README.md))
- `supabase/` — Supabase database migrations, functions, and seed data
- `docs/` — Project documentation

## Getting started

See [docs/SETUP.md](docs/SETUP.md) for running locally, environment files, and auth configuration.

For the Admin console, start with [admin/README.md](admin/README.md) and the [integration and testing guide](docs/admin-local-integration.md). API mode reads the database; mock mode is a separate browser-only demonstration.

The admin Edge Function and frontend API client are documented in [docs/admin-api.md](docs/admin-api.md), including the team contract adapter, announcement management, legacy operations, transport differences and remaining database gaps.

For the database maintainer, [docs/admin-database-handoff.md](docs/admin-database-handoff.md) maps completed and outstanding admin features to backlog tasks, proposed schema/RLS changes, shared processing requirements and acceptance tests.

## Admin presentation mode

The Admin console defaults to frontend mock data for presentations; it needs no Supabase connection. Run `npm ci` and `npm run dev` in `admin/`, then open `http://localhost:3000`. Use any valid email that does not start with `player` and any nonempty password. All mock actions stay in the browser; they do not establish completion of the corresponding backend feature.

If an existing `admin/.env.local` or hosting environment sets `NEXT_PUBLIC_ADMIN_DATA_SOURCE=api`, change it to `mock` and restart development or rebuild production before presenting. Do not run `setup:local` for the mock presentation: it configures API mode. The real API integration remains available through the setup guide.

## Documentation scope

- [Database schema](docs/database-schema.md) and [RLS policies](docs/rls-policies.md) describe the shared database, including direct Player API permissions.
- [Player frontend wiring](docs/frontend-wiring-guide.md) and the generated YAML specifications describe `/rest/v1` and shared SQL RPCs, separately from the Admin Edge transport.
- [Admin API](docs/admin-api.md) describes `/functions/v1/admin-api`, supported writes and Final v6 read-only restrictions.
- [Deployment](docs/DEPLOYMENT.md) covers hosted setup. Publishing a Git branch does not deploy its database, functions or either frontend.
