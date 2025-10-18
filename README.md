# BethBoom Operations Panel

BethBoom is a Next.js 14 application that centralises daily operations for RP betting rooms: access control, market management, ticket sales, payouts, cash sessions, reports, and full auditing as defined in `hojatecnica.md`.

## Requirements

- Node.js 18.18 or newer (project tested with 20.x)
- pnpm 8+
- PostgreSQL database (Supabase compatible)

## Environment

Duplicate `.env.example` and adjust credentials:

```
cp .env.example .env
```

Required variables:

- `DATABASE_URL` / `DIRECT_URL` - connection strings for Prisma migrations and runtime
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` - remote storage/api if using Supabase
- `SESSION_SECRET` - random long string for session signing
- `ACCESS_CODE_PEPPER` - static pepper used when hashing AccessCodes

## Database

Install dependencies and apply schema:

```
pnpm install
pnpm db:migrate      # deploy migrations
pnpm db:seed         # seed default HQ, ranks, parameters, and sample AccessCodes
```

## Useful Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start Next.js in development mode |
| `pnpm build` | Production build (runs type check + lint) |
| `pnpm start` | Serve production build |
| `pnpm lint` | ESLint with zero warnings allowed |
| `pnpm typecheck` | TypeScript check without emitting files |
| `pnpm test` | Vitest unit suite (odds, pool distribution, rank validations) |
| `pnpm test:watch` | Unit tests in watch mode |
| `pnpm test:e2e` | Playwright smoke test (requires app running separately) |
| `pnpm test:e2e:headed` | Same as above in headed mode |

### Running the E2E smoke test

The Playwright test expects a running instance (default `http://127.0.0.1:3000`). Start the dev server in one terminal, then run:

```
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
```

## Project Structure (highlights)

```
src/app/(auth)         # Access code login flow
src/app/(app)/dashboard# KPIs and alerts
src/app/(app)/ventas   # Ticket sales
src/app/(app)/payments # Payouts and cash integration
src/app/(app)/cash     # Cash sessions
src/app/(app)/markets  # Market CRUD
src/app/(app)/apostadores # Alias management
src/app/(app)/reports  # KPIs + CSV/JSON export
src/app/(app)/admin    # Sedes, users, parameters, purge tools
src/app/(app)/audits   # Log review with deletion (admin only)
src/lib/business       # Odds, pool, rank helpers (+ unit tests)
```

## Deployment

1. Ensure environment variables are configured for production DB/Supabase.
2. Run `pnpm build` to generate the production bundle.
3. Use `pnpm start` (or deploy to Vercel) with the same `.env` settings.

## Testing Summary

- **Unit tests:** `pnpm test` covers odds calculation, pool payout distribution, and rank boundary validation.
- **Smoke E2E:** `tests/e2e/smoke.spec.ts` recorre venta -> cierre -> pago -> caja usando Playwright.

Review `hojatecnica.md` for the complete functional specification that this implementation follows.

