# Ninja Pricer

Internal cost & pricing simulator for Ninja Concepts.

See [docs/superpowers/specs/](docs/superpowers/specs/) for the design spec.
See [docs/superpowers/plans/](docs/superpowers/plans/) for phase plans.

## Environment variables

- `QUOTE_STORAGE_DIR` — absolute path where generated quote PDFs are written (local default: `./.quote-storage`; on Railway, point to a persistent volume mount).

## Railway deployment

One-time setup in the Railway dashboard:

1. **Persistent volume.** Service → Settings → Volumes → add a volume mounted at `/data/quotes` (or any absolute path). Without this, generated PDFs are written to ephemeral storage and disappear on every redeploy.
2. **Environment variables** (Service → Variables):
   - `QUOTE_STORAGE_DIR` — set to the volume mount path (e.g. `/data/quotes`). The `start` script fails fast if this is unset.
   - `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `MICROSOFT_ENTRA_TENANT_ID`, `MICROSOFT_ENTRA_CLIENT_ID`, `MICROSOFT_ENTRA_CLIENT_SECRET`, `SEED_ADMIN_EMAIL` — see the design spec for the full list.

The `npm start` command runs `prisma migrate deploy`, seeds, then starts Next. If `QUOTE_STORAGE_DIR` is unset or the directory can't be created, the deploy fails with a visible error before Next boots.
