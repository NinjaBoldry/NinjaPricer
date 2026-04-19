# Phase 1 Code Review — Follow-ups for Phase 2

> Captured from the final Phase 1 code review. Phase 1 was approved to ship with these items as non-blocking follow-ups. Address in early Phase 2 tasks so they don't compound.

## Important (address early in Phase 2)

1. **Keep Decimal through contract aggregation.** `lib/engine/saas-tab.ts:27-29`, `custom-labor-tab.ts`, `packaged-labor-tab.ts` round to cents at monthly, then multiply by `contractMonths`. This rounds twice. Fix: compute `contractCostDec = monthlyCostDec.mul(contractMonths)` in `Decimal`, then `toCents` each boundary independently.

2. **Validate TAB_REVENUE / TAB_MARGIN commission rules have `scopeProductId`.** `lib/engine/commissions.ts:45-51` silently returns $0 if scope is missing. Either throw `ValidationError` or add a DB-level check constraint. Same concern for DEPARTMENT-scoped rules.

3. **Replace the stringly-typed `breakdown.effectiveDiscount` coupling.** `lib/engine/rails.ts:61-66` reads a string back out of `TabResult.breakdown`. Add a typed field (e.g., `saasMeta?: { effectiveDiscountPct: Decimal }`) to `TabResult` so the rails contract is explicit.

4. **Throw on unknown `vendorRateId` in `baseVariablePerUser`.** `lib/engine/saas-cost.ts:11` silently skips unknown ids. Since the engine receives a snapshot built from the DB, an unknown id is an upstream bug — throw `ValidationError` like `mix.ts` does for unknown personas.

5. **Plumb `contractMonths` to `evaluateRails` instead of inferring it.** `lib/engine/rails.ts:72-75` divides `contractCostCents / monthlyCostCents` to derive months. Pass `contractMonths` through `compute()` → `evaluateRails` or store it on `TabResult`.

6. **Add NextAuth module augmentation for role typing.** `auth.ts`, `lib/auth/session.ts`, and `components/TopNav.tsx` all hand-cast `session.user as { role?: string }`. Replace with a proper `declare module 'next-auth'` augmentation so the `role` is typed end-to-end, and remove the casts.

7. **Admin middleware-level role check.** Phase 1 role enforcement lives in `app/admin/layout.tsx` via `requireAdmin()`. When Phase 2 adds `/admin/api/*` routes not under that layout, they won't be guarded. Either colocate all admin routes under the layout, or add role checks at the middleware matcher level.

## Minor (pick up opportunistically)

8. **`effectiveDiscount` should clamp below 0.** `lib/engine/saas-discount.ts:21-24` only clamps the upper bound. A negative `discountOverridePct` would push revenue above list.

9. **`compute.ts` silently filters out commission rules with empty tiers.** Should log a warning via `logger` — empty-tier rules are likely misconfigurations.

10. **`Math.abs(total - 100) > 0.001` in `mix.ts`** uses float arithmetic on percentage sums. Rest of the engine is Decimal-first — minor consistency blemish, worth considering.

11. **`seed.ts` creates a user with no `microsoftSub`.** Document the manual link step or handle it in an adapter callback, so Phase 2 admin users don't get duplicate Account rows when the real Entra sign-in happens.

12. **Add test for `computeSaaSTab` with `seatCount === 0`.** Code guards `< 0` but the zero-path isn't explicitly tested.

13. **Confirm `dotenv` availability.** `prisma.config.ts` imports `dotenv` but it's not in `package.json` devDeps. If it's resolved transitively via Prisma, CI migration commands depending on `.env.local` could fail if transitive resolution changes.
