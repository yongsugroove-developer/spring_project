# Local DB/Auth/Billing Setup

## Scope
- Local MySQL runs on `127.0.0.1:3307`
- App storage driver is `mysql`
- Planner data now supports user-scoped persistence
- Auth uses bearer session tokens stored in MySQL
- Billing is a manual placeholder structure for later provider integration

## Local Commands
- Start MySQL: `npm run db:mysql:start`
- Stop MySQL: `npm run db:mysql:stop`
- Run app: `npm run dev`
- Build: `npm run build`

## Environment
- Copy `.env.example` to `.env` for a fresh setup
- Required local variables:
  - `MYSQL_HOST`
  - `MYSQL_PORT`
  - `MYSQL_DATABASE`
  - `MYSQL_USER`
  - `MYSQL_PASSWORD`
  - `BOOTSTRAP_ADMIN_EMAIL`
  - `BOOTSTRAP_ADMIN_PASSWORD`

## API Surface Added
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/billing/plans`
- `GET /api/billing/overview`
- `POST /api/billing/subscription`
- `GET /api/admin/overview`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/subscription`
- `GET /api/admin/subscriptions`
- `GET /api/admin/sessions`
- `GET /api/admin/logs`

## Current Constraints
- Billing is `manual` only. No Stripe/App Store/Play checkout yet.
- Browser UI now uses a dedicated `/login` / `/login.html` entry page and redirects unauthenticated users away from the main planner shell.
- Backoffice is only available to `owner` and `admin` roles after login.
- The backend can still fall back to the bootstrap workspace when `AUTH_REQUIRED=false`, but the current browser app flow is intentionally login-first.
- Production rollout still needs `AUTH_REQUIRED=true`, real checkout, and secret rotation.
