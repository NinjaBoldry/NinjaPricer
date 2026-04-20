# Ninja Pricer

Internal cost & pricing simulator for Ninja Concepts.

See [docs/superpowers/specs/](docs/superpowers/specs/) for the design spec.
See [docs/superpowers/plans/](docs/superpowers/plans/) for phase plans.

## Environment variables

- `QUOTE_STORAGE_DIR` — absolute path where generated quote PDFs are written (local default: `./.quote-storage`; on Railway, point to a persistent volume mount).
