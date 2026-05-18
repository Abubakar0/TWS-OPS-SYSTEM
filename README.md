# TWS OPS System

Internal ecommerce operations MVP for replacing the current Google Sheets workflow.

## Current MVP Slice

Implemented in this first slice:

- Recommended folder structure and architecture notes
- PostgreSQL schema
- Express backend setup
- JWT login and role-based route protection
- Product submission API with simple ROI/profit/duplicate validation
- Angular Material dashboard shell
- Login screen
- Hunter product submission workflow
- Lister approved product queue layout
- Admin dashboard layout with basic product stats

Not implemented yet:

- Mark listed flow
- Account usage analytics
- Auto ordering
- Auto listing
- Scraping infrastructure
- Notifications
- AI features

## Local Setup

Backend:

```bash
cd backend
copy .env.example .env
npm install
npm run db:seed
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm start
```

Default API URL for the frontend is `http://localhost:4000/api`.

## Railway Setup

Use separate Railway services for this monorepo:

1. Backend service
   - Root Directory: `/backend`
   - Start Command: `npm start`
   - Variables:
     - `NODE_ENV=production`
     - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
     - `JWT_SECRET=<long random secret>`
     - `CORS_ORIGIN=<your frontend Railway public URL>`
     - `MIN_ROI=20`
     - `MIN_PROFIT=5`
     - `MIN_STOCK=1`
     - `MAX_DELIVERY_DAYS=7`

2. Frontend service
   - Root Directory: `/frontend`
   - Build Command: `npm run build`
   - Start Command: `npm run start:railway`
   - Variables:
     - `API_URL=<your backend Railway public URL>/api`

3. PostgreSQL service
   - Add a Railway PostgreSQL database in the same project.
   - Run `npm run db:seed` once against the backend service environment to create tables and demo users.

Demo users created by `npm run db:seed`:

- `admin@example.com`
- `hunter@example.com`
- `lister@example.com`

Password for all demo users:

```text
Password123!
```

## Important Files

- Architecture and API plan: `docs/architecture.md`
- PostgreSQL schema: `database/schema.sql`
- Backend entry point: `backend/src/server.js`
- Frontend routes: `frontend/src/app/app.routes.ts`
