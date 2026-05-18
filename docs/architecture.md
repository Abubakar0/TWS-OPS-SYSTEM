# TWS OPS System MVP Architecture

## Goal

Replace the current Google Sheets workflow with a simple internal ecommerce operations dashboard.

This MVP focuses only on:

- Project setup
- Authentication
- Database schema
- Basic dashboard layouts
- Product submission workflow

Out of scope for this slice:

- Auto ordering
- Auto listing
- AI features
- Advanced analytics
- Notifications
- Scraping infrastructure

## Recommended Folder Structure

```text
TWS-OPS-SYSTEM/
  backend/
    src/
      app.js
      server.js
      config/
        env.js
      db/
        pool.js
      middleware/
        auth.js
        error.js
      modules/
        auth/
          auth.routes.js
          auth.controller.js
          auth.service.js
        products/
          products.routes.js
          products.controller.js
          products.service.js
        dashboard/
          dashboard.routes.js
          dashboard.controller.js
      utils/
        productAnalysis.js
    scripts/
      seed.js
    .env.example
    package.json
  frontend/
    src/
      app/
        core/
          auth/
          guards/
          services/
        layouts/
        features/
          auth/
          hunter/
          lister/
          admin/
          products/
        shared/
      styles.scss
    package.json
  database/
    schema.sql
  docs/
    architecture.md
```

## Backend Architecture

- Node.js and Express REST API.
- PostgreSQL through `pg`.
- JWT authentication with role checks.
- Modular routes grouped by business area.
- Environment variables loaded from `.env`.
- Product analysis is intentionally simple for the MVP:
  - Parse ASIN from Amazon URL when possible.
  - Estimate profit and ROI from submitted prices.
  - Check duplicate ASIN.
  - Apply simple thresholds for ROI, profit, stock, and delivery days.

## Frontend Architecture

- Angular latest stable CLI project.
- Angular Material for UI controls and dashboard layout.
- Standalone components and route guards.
- Feature folders by workflow:
  - `auth`: login
  - `hunter`: product submission and hunter queue
  - `lister`: approved products placeholder layout
  - `admin`: basic stats placeholder layout
- API access stays in small services under `core/services`.

## PostgreSQL Schema Summary

- `users`: internal users with `admin`, `hunter`, or `lister` roles.
- `accounts`: eBay accounts used by listers.
- `products`: hunter submissions, validation outputs, listing assignment fields, status, profit, ROI, timestamps.
- `listings`: final eBay listing metadata after a lister marks a product listed.

## API Route Plan

### Auth

- `POST /api/auth/login`
  - Public.
  - Body: `email`, `password`.
  - Returns JWT and user profile.

- `GET /api/auth/me`
  - Auth required.
  - Returns current user profile.

### Products

- `POST /api/products`
  - Hunter or admin.
  - Body: Amazon/eBay URLs and basic product inputs needed for MVP calculation.
  - Creates product with `approved` or `rejected` status.

- `GET /api/products`
  - Auth required.
  - Hunter sees own submissions.
  - Lister sees approved products.
  - Admin sees all products.

- `GET /api/products/:id`
  - Auth required with role-aware access.

### Listings

- `POST /api/products/:id/list`
  - Lister or admin.
  - Body: account used, listing URL, item ID.
  - Future slice: creates listing and marks product `listed`.

### Dashboard

- `GET /api/dashboard/admin`
  - Admin only.
  - Future slice: daily hunting stats, daily listing stats, account usage, recent activity.

- `GET /api/dashboard/hunter`
  - Hunter only.
  - Future slice: hunter submission totals.

- `GET /api/dashboard/lister`
  - Lister only.
  - Future slice: approved queue and listing totals.
