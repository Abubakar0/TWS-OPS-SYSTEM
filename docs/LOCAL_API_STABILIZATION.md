# Local Backend, Database, and API Stabilization

This phase blocks new UI feature work until the backend can be verified locally and the API health check is clean.

## Current Local Prerequisite Status

This workstation now has a local no-service PostgreSQL 16 runtime for API stabilization:

- PostgreSQL binaries: `%LOCALAPPDATA%\Codex\Postgres16\pgsql`
- Data directory: `%LOCALAPPDATA%\Codex\Postgres16\data`
- Log file: `%LOCALAPPDATA%\Codex\Postgres16\postgres.log`
- Host/port: `localhost:5432`
- Database: `tws_ops`
- User/password: `postgres` / `postgres`

The runtime uses the official EDB PostgreSQL Windows x64 binary archive, so it does not require a Windows service. Keep using a real PostgreSQL database for this app because the schema depends on PostgreSQL-specific extensions, JSONB, UUIDs, constraints, and date/time behavior.

## Environment

Create `backend/.env` from `backend/.env.example`:

```env
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:4200,http://localhost:4201
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tws_ops
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=8h
APP_TIMEZONE=Asia/Karachi
```

For frontend local testing against local backend:

```powershell
$env:API_URL='http://localhost:4000/api'
npm --prefix frontend run build
npm --prefix frontend start
```

For frontend local testing against staging backend:

```powershell
$env:API_URL='https://tws-ops-system-backend-staging.up.railway.app/api'
npm --prefix frontend run build
npm --prefix frontend start
```

## Database Setup

Start the local no-service PostgreSQL runtime:

```powershell
$root = Join-Path $env:LOCALAPPDATA 'Codex\Postgres16'
$pgbin = Join-Path $root 'pgsql\bin'
$data = Join-Path $root 'data'
$log = Join-Path $root 'postgres.log'
& (Join-Path $pgbin 'pg_ctl.exe') -D $data -l $log -o "-p 5432" start
```

Stop it when needed:

```powershell
$root = Join-Path $env:LOCALAPPDATA 'Codex\Postgres16'
$pgbin = Join-Path $root 'pgsql\bin'
$data = Join-Path $root 'data'
& (Join-Path $pgbin 'pg_ctl.exe') -D $data stop
```

Create/seed the local database:

```powershell
$root = Join-Path $env:LOCALAPPDATA 'Codex\Postgres16'
$pgbin = Join-Path $root 'pgsql\bin'
$env:PGPASSWORD='postgres'
& (Join-Path $pgbin 'createdb.exe') -h localhost -p 5432 -U postgres tws_ops
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/tws_ops'
npm --prefix backend run db:seed
```

`npm --prefix backend run db:seed` applies `backend/database/schema.sql` and seeds realistic regression data:

- Super Admin, Admin, Hunter, Training Hunter, Listers, Order Processors, HR
- Accounts with country, currency, previous order counts, and profit split values
- Products across listed, assigned, rejected, and listing-review states
- Orders across placed, delivered, returned, and issue states
- Product change request linked to an order issue
- Employee profiles with DOB, attendance, payroll, leave, and expense data

Demo password for seeded users is `Password123!` unless `SEED_PASSWORD` is set.

## Backend Start

```powershell
npm --prefix backend install
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/tws_ops'
$env:PORT='4000'
$env:CORS_ORIGIN='http://localhost:4200,http://localhost:4201'
$env:APP_TIMEZONE='Asia/Karachi'
npm --prefix backend run start
```

Health check:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

Expected:

```json
{ "status": "ok" }
```

## API Audit

Local audit:

```powershell
$env:API_BASE_URL='http://localhost:4000/api'
$env:API_AUDIT_MUTATIONS='false'
npm --prefix backend run regression:api
```

Staging audit:

```powershell
$env:API_BASE_URL='https://tws-ops-system-backend-staging.up.railway.app/api'
$env:API_AUDIT_MUTATIONS='false'
npm --prefix backend run regression:api
```

Full regression after local DB is available:

```powershell
$env:API_BASE_URL='http://localhost:4000/api'
$env:API_AUDIT_MUTATIONS='true'
npm --prefix backend run regression:all
```

## Mandatory Stabilization Endpoints

These must pass locally before feature work continues:

- `GET /api/hr/me`
- `PATCH /api/hr/me/profile`
- `GET /api/reports/summary`
- `GET /api/reports/executive`
- `GET /api/orders?...search=...`
- `GET /api/products?status=listed_needs_review`
- order creation/status update endpoints
- product transfer endpoints
- product bulk status endpoints

## Fixes Applied In This Stabilization Pass

- A local PostgreSQL 16 runtime was installed from the no-service binary archive and seeded successfully.
- Reports now run product schema guards before aggregate queries that depend on category and listing review columns.
- Executive report no longer fails all-or-nothing when one child aggregate fails; it returns a stable response shape and logs the failing section.
- HR date parsing now rejects impossible dates like `2026-02-31` with a 400 instead of relying on JavaScript date normalization.
- HR date-only response serialization now returns `YYYY-MM-DD` for DOB/joining dates, avoiding UTC day-shift bugs in the UI.
- HR dashboard employee counts now count distinct non-deleted employee profiles and active employees.
- Order table startup guard refreshes status constraints and includes `RETURNED`.
- Order creation is forced to `paymentStatus=PAID`, `placementStatus=PLACED`, and `orderStatus=PLACED`.
- Order status updates now reject legacy `PLACED`/`SHIPPED` status patches and allow direct `DELIVERED` from a placed order once.
- Backend error middleware maps common database errors to 400/409 responses instead of unexpected 500s.
- Frontend request cache now adds a short failed-request cooldown to prevent repeated failed cached calls from hammering the same endpoint.
- Local schema now includes current columns for users, accounts, products, orders, HR profiles, criteria, and product ownership transfers.
- Local seed now creates realistic linked data for API regression.
- Frontend build environment default now remains staging-safe unless `API_URL` is explicitly overridden for local testing.

## Latest Local Verification

Local backend/database verification was run against `http://localhost:4000/api`.

- `npm --prefix backend run db:seed`: passed
- Read/write API audit: 88 checks, 0 failures
- Relationship regression: 33 checks, 0 failures
- Order workflow regression: 21 checks, 0 failures
- Accounts/invoice regression: 11 checks, 0 failures
- Full command: `API_BASE_URL=http://localhost:4000/api API_AUDIT_MUTATIONS=true npm --prefix backend run regression:all`
- DOB targeted check: set DOB, read DOB as `YYYY-MM-DD`, update without DOB, clear DOB, invalid DOB returns 400

## Latest Staging Audit Snapshot

Read-only staging audit was run with `API_AUDIT_MUTATIONS=false` before these local backend fixes were deployed.

- Checks run: 78
- Remaining pre-deploy staging failures: 2
- Failed endpoints:
  - `GET /api/reports/executive?dateFrom=2026-05-01&dateTo=2026-05-31` as Admin
  - `GET /api/reports/executive?dateFrom=2026-05-01&dateTo=2026-05-31` as Super Admin

All other audited known endpoints returned non-500 responses in that staging pass, including `/api/hr/me`, `/api/reports/summary`, orders search with `%` and `'`, and listing review filters. The executive endpoint passes locally after the report hardening patch and should be rechecked on staging after deployment.
