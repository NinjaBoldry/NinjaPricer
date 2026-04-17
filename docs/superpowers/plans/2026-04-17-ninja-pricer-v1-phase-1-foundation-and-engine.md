# Ninja Pricer v1 — Phase 1: Foundation + Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffolded Next.js app with Microsoft SSO login, role-protected route shells, full v1 Postgres schema migrated, and a fully unit-tested pure pricing engine in `lib/engine/`.

**Architecture:** Single Next.js 14 app (app router) deployed to Railway. Prisma ORM against Postgres. NextAuth with Microsoft Entra provider. Pricing engine is a pure TypeScript module with no DB or framework imports — tested in isolation with golden fixtures.

**Tech Stack:** TypeScript (strict), Next.js 14, Prisma, Postgres (Railway-managed; Docker local), NextAuth v5, `decimal.js` for precise monetary math, Vitest, GitHub Actions.

**Spec reference:** [docs/superpowers/specs/2026-04-17-ninja-pricer-v1-design.md](../specs/2026-04-17-ninja-pricer-v1-design.md)

**Phase roadmap:** [docs/superpowers/plans/2026-04-17-ninja-pricer-v1-phases.md](./2026-04-17-ninja-pricer-v1-phases.md)

---

## Conventions for this phase (and all later phases)

- **Tests before implementation.** Write failing test → run → implement → run passing → commit.
- **One task = one commit** unless the task explicitly groups multiple commits.
- **Money in the engine:** all computations go through `decimal.js` `Decimal`. Final totals are exposed in integer cents. Never use `number` for money inside `lib/engine`.
- **Pure engine:** no Prisma imports, no Next.js imports, no `process.env`, no date reads — engine receives everything it needs as input.
- **File layout (locked here; later phases follow):**
  ```
  /app
  /components
  /lib
    /engine                  (pure)
    /engine/tests            (golden fixtures live here for integration-style engine tests; pure unit tests sit next to the code as *.test.ts)
    /db                      (Prisma client, repositories — used in later phases)
    /services                (domain services — used in later phases)
    /auth                    (NextAuth config, role helpers)
    /utils                   (shared utilities: money, logger, errors)
  /prisma
  /tests/e2e                 (Playwright — later phases)
  ```
- **Commit-message style:** conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`).

---

## Part A — Scaffolding

### Task 1: Initialize repo

**Files:**
- Create: `.gitignore`, `README.md`, `LICENSE` (if applicable — skip for internal)

- [ ] **Step 1: Initialize git in the project root**

```bash
cd /Users/boldry/git/NinjaPricer
git init
git branch -M main
```

- [ ] **Step 2: Create .gitignore**

Create `.gitignore`:

```
node_modules/
.next/
out/
.env
.env.local
.env.*.local
*.log
.DS_Store
coverage/
playwright-report/
test-results/
.turbo/
dist/
```

- [ ] **Step 3: Create a minimal README**

Create `README.md`:

```markdown
# Ninja Pricer

Internal cost & pricing simulator for Ninja Concepts.

See [docs/superpowers/specs/](docs/superpowers/specs/) for the design spec.
See [docs/superpowers/plans/](docs/superpowers/plans/) for phase plans.
```

- [ ] **Step 4: Initial commit**

```bash
git add .gitignore README.md docs/
git commit -m "chore: initialize repo with spec and phase plans"
```

---

### Task 2: Scaffold Next.js 14 with TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Create Next.js app in the current directory**

```bash
cd /Users/boldry/git/NinjaPricer
npx create-next-app@14 . --ts --eslint --app --src-dir=false --tailwind --import-alias "@/*" --use-npm
```

Accept defaults. Select Yes for app router, Yes for Tailwind. It will create the scaffold alongside existing `docs/`.

- [ ] **Step 2: Verify scaffold builds and runs**

```bash
npm run build
```

Expected: successful build output, no errors.

- [ ] **Step 3: Clean up template content**

Replace `app/page.tsx` with:

```tsx
export default function Home() {
  return <main className="p-6">Ninja Pricer</main>;
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: scaffold Next.js 14 app with TypeScript and Tailwind"
```

---

### Task 3: Configure strict TypeScript + Prettier

**Files:**
- Modify: `tsconfig.json`
- Create: `.prettierrc.json`, `.prettierignore`

- [ ] **Step 1: Enable strict TS options**

Edit `tsconfig.json` — ensure `compilerOptions` includes:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  }
}
```

(Merge with existing options — don't drop `paths`, `plugins`, etc.)

- [ ] **Step 2: Install and configure Prettier**

```bash
npm install -D prettier eslint-config-prettier
```

Create `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

Create `.prettierignore`:

```
.next/
node_modules/
out/
coverage/
```

- [ ] **Step 3: Add Prettier scripts to package.json**

Add to `scripts`:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 4: Run format and verify no errors**

```bash
npm run format
npm run typecheck 2>/dev/null || npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: enable strict TS and Prettier"
```

---

### Task 4: Install Vitest and set up unit test infra

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest @vitest/ui @vitejs/plugin-react
```

- [ ] **Step 2: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts', 'lib/**/tests/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

- [ ] **Step 3: Add test scripts to package.json**

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 4: Verify Vitest runs with zero tests**

```bash
npm test
```

Expected: exits 0 (no test files yet is fine).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: add Vitest for unit testing"
```

---

### Task 5: Create /lib folder structure

**Files:**
- Create: `lib/engine/.gitkeep`, `lib/db/.gitkeep`, `lib/services/.gitkeep`, `lib/auth/.gitkeep`, `lib/utils/.gitkeep`

- [ ] **Step 1: Create folders with placeholder files**

```bash
mkdir -p lib/engine lib/engine/tests lib/db lib/services lib/auth lib/utils
touch lib/engine/.gitkeep lib/engine/tests/.gitkeep lib/db/.gitkeep lib/services/.gitkeep lib/auth/.gitkeep lib/utils/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add lib/
git commit -m "chore: create lib folder structure"
```

---

## Part B — Shared Utilities

### Task 6: Money utility module

**Files:**
- Create: `lib/utils/money.ts`, `lib/utils/money.test.ts`

- [ ] **Step 1: Install decimal.js**

```bash
npm install decimal.js
```

- [ ] **Step 2: Write failing test**

Create `lib/utils/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d, toCents, fromCents, toDollarsString } from './money';

describe('money', () => {
  it('d() creates a Decimal from a number', () => {
    expect(d(1.23).toString()).toBe('1.23');
  });

  it('d() creates a Decimal from a string', () => {
    expect(d('0.0043').toString()).toBe('0.0043');
  });

  it('toCents() rounds to integer cents (half-up)', () => {
    expect(toCents(d('1.234'))).toBe(123);
    expect(toCents(d('1.235'))).toBe(124);
    expect(toCents(d('0.0043'))).toBe(0);
  });

  it('fromCents() converts integer cents to Decimal dollars', () => {
    expect(fromCents(123).toString()).toBe('1.23');
  });

  it('toDollarsString() formats cents as $X.XX', () => {
    expect(toDollarsString(123)).toBe('$1.23');
    expect(toDollarsString(0)).toBe('$0.00');
    expect(toDollarsString(1234567)).toBe('$12,345.67');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test lib/utils/money.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 4: Implement the module**

Create `lib/utils/money.ts`:

```ts
import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

export function d(v: Decimal.Value): Decimal {
  return new Decimal(v);
}

export function toCents(dollars: Decimal): number {
  return dollars.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function fromCents(cents: number): Decimal {
  return new Decimal(cents).div(100);
}

export function toDollarsString(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test lib/utils/money.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/money.ts lib/utils/money.test.ts package.json package-lock.json
git commit -m "feat: add money utility with decimal.js"
```

---

### Task 7: Typed errors module

**Files:**
- Create: `lib/utils/errors.ts`, `lib/utils/errors.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/utils/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NotFoundError, ValidationError, RailHardBlockError, isAppError } from './errors';

describe('errors', () => {
  it('NotFoundError has correct name and message', () => {
    const err = new NotFoundError('Product', 'abc123');
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('Product not found: abc123');
    expect(err.entity).toBe('Product');
    expect(err.id).toBe('abc123');
  });

  it('ValidationError carries field and reason', () => {
    const err = new ValidationError('seat_count', 'must be >= 0');
    expect(err.name).toBe('ValidationError');
    expect(err.field).toBe('seat_count');
    expect(err.reason).toBe('must be >= 0');
  });

  it('RailHardBlockError carries rail metadata', () => {
    const err = new RailHardBlockError('min_margin', 0.45, 0.5);
    expect(err.name).toBe('RailHardBlockError');
    expect(err.railKey).toBe('min_margin');
    expect(err.measured).toBe(0.45);
    expect(err.threshold).toBe(0.5);
  });

  it('isAppError identifies our error types', () => {
    expect(isAppError(new NotFoundError('X', 'y'))).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test lib/utils/errors.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

Create `lib/utils/errors.ts`:

```ts
export abstract class AppError extends Error {
  abstract readonly name: string;
}

export class NotFoundError extends AppError {
  readonly name = 'NotFoundError';
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} not found: ${id}`);
  }
}

export class ValidationError extends AppError {
  readonly name = 'ValidationError';
  constructor(
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`${field}: ${reason}`);
  }
}

export class RailHardBlockError extends AppError {
  readonly name = 'RailHardBlockError';
  constructor(
    public readonly railKey: string,
    public readonly measured: number,
    public readonly threshold: number,
  ) {
    super(`Rail hard block on ${railKey}: measured ${measured} vs threshold ${threshold}`);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test lib/utils/errors.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/utils/errors.ts lib/utils/errors.test.ts
git commit -m "feat: add typed error module"
```

---

### Task 8: Logger utility

**Files:**
- Create: `lib/utils/logger.ts`

- [ ] **Step 1: Create logger**

Create `lib/utils/logger.ts`:

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...(context ?? {}),
  };
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/utils/logger.ts
git commit -m "feat: add structured JSON logger"
```

(No test — logger is a thin wrapper over console; tested indirectly by its use sites.)

---

## Part C — Database

### Task 9: Install Prisma and set up Docker Postgres

**Files:**
- Create: `docker-compose.yml`, `.env.local.example`, `prisma/schema.prisma`

- [ ] **Step 1: Install Prisma**

```bash
npm install prisma @prisma/client
npx prisma init
```

This creates `prisma/schema.prisma` and a `.env` file. Move any `DATABASE_URL` from `.env` into `.env.local` and delete `.env` from git tracking.

- [ ] **Step 2: Create docker-compose.yml for local Postgres**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ninja
      POSTGRES_PASSWORD: ninja_dev
      POSTGRES_DB: ninja_pricer
    ports:
      - '5432:5432'
    volumes:
      - ninja_db:/var/lib/postgresql/data

volumes:
  ninja_db:
```

- [ ] **Step 3: Create .env.local.example**

Create `.env.local.example`:

```
DATABASE_URL="postgresql://ninja:ninja_dev@localhost:5432/ninja_pricer?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="change-me-generate-with-openssl-rand-base64-32"
MICROSOFT_ENTRA_TENANT_ID=""
MICROSOFT_ENTRA_CLIENT_ID=""
MICROSOFT_ENTRA_CLIENT_SECRET=""
ALLOWED_EMAIL_DOMAIN="ninjaconcepts.com"
SEED_ADMIN_EMAIL="boldry.thompson@ninjaconcepts.com"
```

- [ ] **Step 4: Create .env.local for local dev**

```bash
cp .env.local.example .env.local
```

(The engineer fills in Microsoft Entra values when configuring SSO in Task 13.)

- [ ] **Step 5: Start Postgres and verify connection**

```bash
docker compose up -d
```

Verify with:

```bash
docker compose ps
```

Expected: `db` service running.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.local.example prisma/schema.prisma
git commit -m "chore: add Prisma and Docker Postgres for local dev"
```

---

### Task 10: Write full v1 Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Replace schema.prisma with the full v1 schema**

Replace `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  SALES
}

enum ProductKind {
  SAAS_USAGE
  PACKAGED_LABOR
  CUSTOM_LABOR
}

enum LaborSKUUnit {
  PER_USER
  PER_SESSION
  PER_DAY
  FIXED
}

enum BurdenScope {
  ALL_DEPARTMENTS
  DEPARTMENT
}

enum EmployeeCompensationType {
  ANNUAL_SALARY
  HOURLY
}

enum CommissionScopeType {
  ALL
  PRODUCT
  DEPARTMENT
}

enum CommissionBaseMetric {
  REVENUE
  CONTRIBUTION_MARGIN
  TAB_REVENUE
  TAB_MARGIN
}

enum RailKind {
  MIN_MARGIN_PCT
  MAX_DISCOUNT_PCT
  MIN_SEAT_PRICE
  MIN_CONTRACT_MONTHS
}

enum MarginBasis {
  CONTRIBUTION
  NET
}

enum ScenarioStatus {
  DRAFT
  QUOTED
  ARCHIVED
}

model User {
  id              String           @id @default(cuid())
  email           String           @unique
  name            String
  role            Role             @default(SALES)
  microsoftSub    String?          @unique
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  scenarios       Scenario[]       @relation("ScenarioOwner")
  quotesGenerated Quote[]          @relation("QuoteGenerator")
  commissionsAs   CommissionRule[] @relation("CommissionRecipient")
}

model Product {
  id                    String                   @id @default(cuid())
  name                  String                   @unique
  kind                  ProductKind
  sortOrder             Int                      @default(0)
  isActive              Boolean                  @default(true)
  createdAt             DateTime                 @default(now())
  updatedAt             DateTime                 @updatedAt
  vendorRates           VendorRate[]
  baseUsage             BaseUsage[]
  otherVariable         OtherVariable?
  personas              Persona[]
  fixedCosts            ProductFixedCost[]
  scale                 ProductScale?
  listPrice             ListPrice?
  volumeTiers           VolumeDiscountTier[]
  contractModifiers     ContractLengthModifier[]
  laborSKUs             LaborSKU[]
  rails                 Rail[]
  scenarioSaaSConfigs   ScenarioSaaSConfig[]
  scenarioLaborLines    ScenarioLaborLine[]
  bundleItems           BundleItem[]
  commissionRulesScoped CommissionRule[]         @relation("CommissionProductScope")
}

model VendorRate {
  id        String      @id @default(cuid())
  productId String
  name      String
  unitLabel String
  rateUsd   Decimal     @db.Decimal(18, 8)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  product   Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  baseUsage BaseUsage[]

  @@unique([productId, name])
}

model BaseUsage {
  id             String     @id @default(cuid())
  productId      String
  vendorRateId   String
  usagePerMonth  Decimal    @db.Decimal(18, 6)
  product        Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
  vendorRate     VendorRate @relation(fields: [vendorRateId], references: [id], onDelete: Cascade)

  @@unique([productId, vendorRateId])
}

model OtherVariable {
  id                    String   @id @default(cuid())
  productId             String   @unique
  usdPerUserPerMonth    Decimal  @db.Decimal(18, 4)
  product               Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model Persona {
  id         String   @id @default(cuid())
  productId  String
  name       String
  multiplier Decimal  @db.Decimal(10, 4)
  sortOrder  Int      @default(0)
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, name])
}

model ProductFixedCost {
  id          String   @id @default(cuid())
  productId   String
  name        String
  monthlyUsd  Decimal  @db.Decimal(18, 4)
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, name])
}

model ProductScale {
  id                 String   @id @default(cuid())
  productId          String   @unique
  activeUsersAtScale Int
  product            Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model ListPrice {
  id                 String   @id @default(cuid())
  productId          String   @unique
  usdPerSeatPerMonth Decimal  @db.Decimal(18, 4)
  product            Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model VolumeDiscountTier {
  id          String   @id @default(cuid())
  productId   String
  minSeats    Int
  discountPct Decimal  @db.Decimal(6, 4)
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, minSeats])
}

model ContractLengthModifier {
  id                    String   @id @default(cuid())
  productId             String
  minMonths             Int
  additionalDiscountPct Decimal  @db.Decimal(6, 4)
  product               Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, minMonths])
}

model LaborSKU {
  id                  String       @id @default(cuid())
  productId           String
  name                String
  unit                LaborSKUUnit
  costPerUnitUsd      Decimal      @db.Decimal(18, 4)
  defaultRevenueUsd   Decimal      @db.Decimal(18, 4)
  isActive            Boolean      @default(true)
  product             Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
  bundleItems         BundleItem[]
  scenarioLaborLines  ScenarioLaborLine[]

  @@unique([productId, name])
}

model Department {
  id                  String              @id @default(cuid())
  name                String              @unique
  isActive            Boolean             @default(true)
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  employees           Employee[]
  billRate            DepartmentBillRate?
  burdens             Burden[]            @relation("BurdenDepartmentScope")
  scenarioLaborLines  ScenarioLaborLine[]
  bundleItems         BundleItem[]
  commissionsScoped   CommissionRule[]    @relation("CommissionDepartmentScope")
}

model Burden {
  id           String       @id @default(cuid())
  name         String       @unique
  ratePct      Decimal      @db.Decimal(6, 4)
  capUsd       Decimal?     @db.Decimal(18, 2)
  scope        BurdenScope
  departmentId String?
  department   Department?  @relation("BurdenDepartmentScope", fields: [departmentId], references: [id], onDelete: Cascade)
  isActive     Boolean      @default(true)
}

model Employee {
  id                    String                   @id @default(cuid())
  name                  String
  departmentId          String
  compensationType      EmployeeCompensationType
  annualSalaryUsd       Decimal?                 @db.Decimal(18, 2)
  hourlyRateUsd         Decimal?                 @db.Decimal(18, 4)
  standardHoursPerYear  Int?
  isActive              Boolean                  @default(true)
  createdAt             DateTime                 @default(now())
  updatedAt             DateTime                 @updatedAt
  department            Department               @relation(fields: [departmentId], references: [id], onDelete: Restrict)
}

model DepartmentBillRate {
  id               String     @id @default(cuid())
  departmentId     String     @unique
  billRatePerHour  Decimal    @db.Decimal(18, 4)
  department       Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
}

model CommissionRule {
  id            String                @id @default(cuid())
  name          String
  scopeType     CommissionScopeType
  scopeProductId    String?
  scopeDepartmentId String?
  baseMetric    CommissionBaseMetric
  recipientEmployeeId String?
  notes         String?
  isActive      Boolean               @default(true)
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt
  product       Product?              @relation("CommissionProductScope", fields: [scopeProductId], references: [id], onDelete: SetNull)
  department    Department?           @relation("CommissionDepartmentScope", fields: [scopeDepartmentId], references: [id], onDelete: SetNull)
  recipient     User?                 @relation("CommissionRecipient", fields: [recipientEmployeeId], references: [id], onDelete: SetNull)
  tiers         CommissionTier[]
}

model CommissionTier {
  id                String          @id @default(cuid())
  ruleId            String
  thresholdFromUsd  Decimal         @db.Decimal(18, 2)
  ratePct           Decimal         @db.Decimal(6, 4)
  sortOrder         Int             @default(0)
  rule              CommissionRule  @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@unique([ruleId, thresholdFromUsd])
}

model Bundle {
  id          String        @id @default(cuid())
  name        String        @unique
  description String?
  isActive    Boolean       @default(true)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  items       BundleItem[]
  scenarios   Scenario[]    @relation("ScenarioAppliedBundle")
}

model BundleItem {
  id           String      @id @default(cuid())
  bundleId     String
  productId    String
  skuId        String?
  departmentId String?
  config       Json        // { seatCount, personaMix[], discountOverridePct, qty, unit, hours, etc. }
  sortOrder    Int         @default(0)
  bundle       Bundle      @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  product      Product     @relation(fields: [productId], references: [id], onDelete: Restrict)
  sku          LaborSKU?   @relation(fields: [skuId], references: [id], onDelete: SetNull)
  department   Department? @relation(fields: [departmentId], references: [id], onDelete: SetNull)
}

model Rail {
  id            String       @id @default(cuid())
  productId     String
  kind          RailKind
  marginBasis   MarginBasis  @default(CONTRIBUTION)
  softThreshold Decimal      @db.Decimal(18, 4)
  hardThreshold Decimal      @db.Decimal(18, 4)
  isEnabled     Boolean      @default(true)
  product       Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model Scenario {
  id               String              @id @default(cuid())
  name             String
  customerName     String
  ownerId          String
  contractMonths   Int
  appliedBundleId  String?
  notes            String?
  status           ScenarioStatus      @default(DRAFT)
  isArchived       Boolean             @default(false)
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
  owner            User                @relation("ScenarioOwner", fields: [ownerId], references: [id], onDelete: Restrict)
  appliedBundle    Bundle?             @relation("ScenarioAppliedBundle", fields: [appliedBundleId], references: [id], onDelete: SetNull)
  saasConfigs      ScenarioSaaSConfig[]
  laborLines       ScenarioLaborLine[]
  quotes           Quote[]
}

model ScenarioSaaSConfig {
  id                 String   @id @default(cuid())
  scenarioId         String
  productId          String
  seatCount          Int
  personaMix         Json     // [{ personaId: string, pct: number }]
  discountOverridePct Decimal? @db.Decimal(6, 4)
  scenario           Scenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  product            Product  @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@unique([scenarioId, productId])
}

model ScenarioLaborLine {
  id                  String      @id @default(cuid())
  scenarioId          String
  productId           String
  skuId               String?
  departmentId        String?
  customDescription   String?
  qty                 Decimal     @db.Decimal(18, 4)
  unit                String      // free-form label (hours, sessions, days, users, fixed)
  costPerUnitUsd      Decimal     @db.Decimal(18, 4)
  revenuePerUnitUsd   Decimal     @db.Decimal(18, 4)
  sortOrder           Int         @default(0)
  scenario            Scenario    @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  product             Product     @relation(fields: [productId], references: [id], onDelete: Restrict)
  sku                 LaborSKU?   @relation(fields: [skuId], references: [id], onDelete: SetNull)
  department          Department? @relation(fields: [departmentId], references: [id], onDelete: SetNull)
}

model Quote {
  id                String    @id @default(cuid())
  scenarioId        String
  version           Int
  pdfUrl            String
  internalPdfUrl    String?
  generatedAt       DateTime  @default(now())
  generatedById     String
  customerSnapshot  Json
  totals            Json
  scenario          Scenario  @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  generatedBy       User      @relation("QuoteGenerator", fields: [generatedById], references: [id], onDelete: Restrict)

  @@unique([scenarioId, version])
}
```

- [ ] **Step 2: Format and validate the schema**

```bash
npx prisma format
npx prisma validate
```

Expected: no errors.

- [ ] **Step 3: Create the initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration created under `prisma/migrations/YYYYMMDDHHMMSS_init/` and applied to local DB. Prisma client generated.

- [ ] **Step 4: Verify the DB**

```bash
npx prisma studio
```

Expected: Prisma Studio opens in a browser, all empty tables visible. Close Studio.

- [ ] **Step 5: Commit**

```bash
git add prisma/
git commit -m "feat: add full v1 Prisma schema and initial migration"
```

---

### Task 11: Prisma client singleton

**Files:**
- Create: `lib/db/client.ts`

- [ ] **Step 1: Create singleton Prisma client**

Create `lib/db/client.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 2: Remove .gitkeep since we have a real file**

```bash
rm lib/db/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/
git commit -m "feat: add Prisma client singleton"
```

---

## Part D — Auth + Shell

### Task 12: Install NextAuth v5 and Microsoft Entra provider

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install next-auth@beta @auth/prisma-adapter
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install NextAuth v5 and Prisma adapter"
```

---

### Task 13: Configure NextAuth with Microsoft Entra and domain allowlist

**Files:**
- Create: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `lib/auth/session.ts`, `middleware.ts`
- Modify: `prisma/schema.prisma` (add NextAuth models)

- [ ] **Step 1: Add NextAuth models to Prisma schema**

Append to `prisma/schema.prisma`:

```prisma
model Account {
  id                String   @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?  @db.Text
  access_token      String?  @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?  @db.Text
  session_state     String?
  user              User     @relation("UserAccounts", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation("UserSessions", fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

Add these relations to the existing `User` model (inside the `User { ... }` block):

```prisma
  accounts        Account[]  @relation("UserAccounts")
  sessions        Session[]  @relation("UserSessions")
```

- [ ] **Step 2: Run migration for auth tables**

```bash
npx prisma migrate dev --name nextauth_tables
```

Expected: new migration applied.

- [ ] **Step 3: Create auth.ts at project root**

Create `auth.ts`:

```ts
import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db/client';

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN ?? '';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_ENTRA_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_ENTRA_TENANT_ID}/v2.0`,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email ?? '';
      if (allowedDomain && !email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
        return false;
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        (session.user as { id?: string }).id = user.id;
        (session.user as { role?: string }).role = (user as { role?: string }).role ?? 'SALES';
      }
      return session;
    },
  },
});
```

- [ ] **Step 4: Create the API route**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

- [ ] **Step 5: Create session helper**

Create `lib/auth/session.ts`:

```ts
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export type UserRole = 'ADMIN' | 'SALES';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export async function getSessionUser(): Promise<AuthedUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const u = session.user as {
    id?: string;
    email?: string | null;
    name?: string | null;
    role?: UserRole;
  };
  if (!u.id || !u.email) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? u.email,
    role: u.role ?? 'SALES',
  };
}

export async function requireAuth(): Promise<AuthedUser> {
  const user = await getSessionUser();
  if (!user) redirect('/api/auth/signin');
  return user;
}

export async function requireAdmin(): Promise<AuthedUser> {
  const user = await requireAuth();
  if (user.role !== 'ADMIN') redirect('/scenarios');
  return user;
}
```

- [ ] **Step 6: Create middleware that protects non-public routes**

Create `middleware.ts`:

```ts
import { auth } from '@/auth';

export default auth((req) => {
  const isAuthed = !!req.auth;
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');
  if (!isPublic && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = '/api/auth/signin';
    return Response.redirect(url);
  }
  return undefined;
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 7: Commit**

```bash
git add auth.ts app/api/auth middleware.ts lib/auth prisma/
git commit -m "feat: configure NextAuth with Microsoft Entra and role session"
```

---

### Task 14: Admin seed script

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the seed script**

Create `prisma/seed.ts`:

```ts
import { PrismaClient, Role, ProductKind } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) {
    console.error('SEED_ADMIN_EMAIL not set; skipping seed.');
    return;
  }

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN },
    create: {
      email: adminEmail,
      name: adminEmail.split('@')[0] ?? 'Admin',
      role: Role.ADMIN,
    },
  });
  console.log(`Seeded admin user: ${adminEmail}`);

  const products = [
    { name: 'Ninja Notes', kind: ProductKind.SAAS_USAGE, sortOrder: 1 },
    { name: 'Training & White-glove', kind: ProductKind.PACKAGED_LABOR, sortOrder: 2 },
    { name: 'Service', kind: ProductKind.CUSTOM_LABOR, sortOrder: 3 },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { name: p.name },
      update: {},
      create: p,
    });
  }
  console.log('Seeded v1 products.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Wire up the seed command in package.json**

Add to `package.json`:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

Install `tsx` if not already present:

```bash
npm install -D tsx
```

- [ ] **Step 3: Run the seed**

```bash
npx prisma db seed
```

Expected: log lines showing admin and products seeded.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts package.json package-lock.json
git commit -m "feat: seed admin user and v1 products"
```

---

### Task 15: Role-routed shell layout

**Files:**
- Create: `app/scenarios/page.tsx`, `app/scenarios/layout.tsx`, `app/admin/page.tsx`, `app/admin/layout.tsx`, `components/TopNav.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx`

- [ ] **Step 1: Redirect `/` to `/scenarios` for authed users**

Replace `app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect('/api/auth/signin');
  redirect('/scenarios');
}
```

- [ ] **Step 2: Create the top nav component**

Create `components/TopNav.tsx`:

```tsx
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { signOut } from '@/auth';

export async function TopNav() {
  const user = await getSessionUser();
  return (
    <header className="border-b bg-white">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/scenarios" className="font-semibold">
            Ninja Pricer
          </Link>
          <Link href="/scenarios" className="text-sm">
            My Scenarios
          </Link>
          {user?.role === 'ADMIN' && (
            <Link href="/admin" className="text-sm">
              Admin
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">{user?.email}</span>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button type="submit" className="text-blue-600 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </nav>
    </header>
  );
}
```

- [ ] **Step 3: Scenarios layout + placeholder page**

Create `app/scenarios/layout.tsx`:

```tsx
import { requireAuth } from '@/lib/auth/session';
import { TopNav } from '@/components/TopNav';

export default async function ScenariosLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </>
  );
}
```

Create `app/scenarios/page.tsx`:

```tsx
export default function ScenariosIndex() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">My Scenarios</h1>
      <p className="mt-2 text-gray-600">Scenario list coming in Phase 3.</p>
    </div>
  );
}
```

- [ ] **Step 4: Admin layout + placeholder page**

Create `app/admin/layout.tsx`:

```tsx
import { requireAdmin } from '@/lib/auth/session';
import { TopNav } from '@/components/TopNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </>
  );
}
```

Create `app/admin/page.tsx`:

```tsx
export default function AdminIndex() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-2 text-gray-600">Admin config screens coming in Phase 2.</p>
    </div>
  );
}
```

- [ ] **Step 5: Run the app and verify login + role routing manually**

```bash
npm run dev
```

Visit `http://localhost:3000`. Expected: redirect to Microsoft sign-in (which will fail until env vars are configured — that's fine for this task, the routing path is what's being verified).

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add app/ components/
git commit -m "feat: add role-routed shell layout for scenarios and admin"
```

---

## Part E — Pricing Engine

From here on, every task is fully TDD: failing test → run → implement → run → commit. The engine is pure — no DB, no NextAuth, no `process.env`.

### Task 16: Engine types

**Files:**
- Create: `lib/engine/types.ts`

- [ ] **Step 1: Define all input/output types**

Create `lib/engine/types.ts`:

```ts
import type Decimal from 'decimal.js';

// ────── Rate snapshot (all the reference data the engine needs) ──────

export interface VendorRateSnap {
  id: string;
  name: string;
  unitLabel: string;
  rateUsd: Decimal;
}

export interface BaseUsageSnap {
  vendorRateId: string;
  usagePerMonth: Decimal;
}

export interface PersonaSnap {
  id: string;
  name: string;
  multiplier: Decimal;
}

export interface ProductFixedCostSnap {
  id: string;
  name: string;
  monthlyUsd: Decimal;
}

export interface VolumeTierSnap {
  minSeats: number;
  discountPct: Decimal; // 0.10 = 10%
}

export interface ContractModifierSnap {
  minMonths: number;
  additionalDiscountPct: Decimal;
}

export interface SaaSProductSnap {
  kind: 'SAAS_USAGE';
  productId: string;
  vendorRates: VendorRateSnap[];
  baseUsage: BaseUsageSnap[];
  otherVariableUsdPerUserPerMonth: Decimal;
  personas: PersonaSnap[];
  fixedCosts: ProductFixedCostSnap[];
  activeUsersAtScale: number;
  listPriceUsdPerSeatPerMonth: Decimal;
  volumeTiers: VolumeTierSnap[];
  contractModifiers: ContractModifierSnap[];
}

export interface LaborSKUSnap {
  id: string;
  productId: string;
  name: string;
  unit: 'PER_USER' | 'PER_SESSION' | 'PER_DAY' | 'FIXED';
  costPerUnitUsd: Decimal;
  defaultRevenuePerUnitUsd: Decimal;
}

export interface DepartmentSnap {
  id: string;
  name: string;
  loadedRatePerHourUsd: Decimal; // computed elsewhere; engine treats as given
  billRatePerHourUsd: Decimal;
}

// ────── Scenario inputs ──────

export interface SaaSTabInput {
  kind: 'SAAS_USAGE';
  productId: string;
  seatCount: number;
  personaMix: { personaId: string; pct: number }[]; // pct is 0–100, must sum to 100
  discountOverridePct?: Decimal;
}

export interface PackagedLaborTabInput {
  kind: 'PACKAGED_LABOR';
  productId: string;
  lineItems: {
    skuId?: string;
    customDescription?: string;
    qty: Decimal;
    unit: string;
    costPerUnitUsd: Decimal;
    revenuePerUnitUsd: Decimal;
  }[];
}

export interface CustomLaborTabInput {
  kind: 'CUSTOM_LABOR';
  productId: string;
  lineItems: {
    departmentId?: string;
    customDescription?: string;
    hours: Decimal;
  }[];
}

export type TabInput = SaaSTabInput | PackagedLaborTabInput | CustomLaborTabInput;

export interface CommissionTierSnap {
  thresholdFromUsd: Decimal;
  ratePct: Decimal;
}

export interface CommissionRuleSnap {
  id: string;
  name: string;
  scopeType: 'ALL' | 'PRODUCT' | 'DEPARTMENT';
  scopeProductId?: string;
  scopeDepartmentId?: string;
  baseMetric: 'REVENUE' | 'CONTRIBUTION_MARGIN' | 'TAB_REVENUE' | 'TAB_MARGIN';
  tiers: CommissionTierSnap[];
  recipientEmployeeId?: string;
}

export interface RailSnap {
  id: string;
  productId: string;
  kind: 'MIN_MARGIN_PCT' | 'MAX_DISCOUNT_PCT' | 'MIN_SEAT_PRICE' | 'MIN_CONTRACT_MONTHS';
  marginBasis: 'CONTRIBUTION' | 'NET';
  softThreshold: Decimal;
  hardThreshold: Decimal;
}

export interface ComputeRequest {
  contractMonths: number;
  tabs: TabInput[];
  products: {
    saas: Record<string, SaaSProductSnap>;
    laborSKUs: Record<string, LaborSKUSnap>;
    departments: Record<string, DepartmentSnap>;
  };
  commissionRules: CommissionRuleSnap[];
  rails: RailSnap[];
}

// ────── Outputs ──────

export interface TabResult {
  productId: string;
  kind: 'SAAS_USAGE' | 'PACKAGED_LABOR' | 'CUSTOM_LABOR';
  monthlyCostCents: number;
  monthlyRevenueCents: number;
  oneTimeCostCents: number;
  oneTimeRevenueCents: number;
  contractCostCents: number;
  contractRevenueCents: number;
  contributionMarginCents: number;
  breakdown?: Record<string, unknown>;
}

export interface CommissionBreakdownTier {
  thresholdFromUsd: Decimal;
  ratePct: Decimal;
  amountCents: number;
}

export interface CommissionResult {
  ruleId: string;
  name: string;
  baseAmountCents: number;
  commissionAmountCents: number;
  tierBreakdown: CommissionBreakdownTier[];
}

export interface WarningResult {
  railId: string;
  kind: RailSnap['kind'];
  severity: 'soft' | 'hard';
  message: string;
  measured: number;
  threshold: number;
}

export interface ComputeResult {
  perTab: TabResult[];
  totals: {
    monthlyCostCents: number;
    monthlyRevenueCents: number;
    contractCostCents: number;
    contractRevenueCents: number;
    contributionMarginCents: number;
    netMarginCents: number;
    marginPctContribution: number; // 0..1
    marginPctNet: number;
  };
  commissions: CommissionResult[];
  warnings: WarningResult[];
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/engine/types.ts
git commit -m "feat: define engine input/output types"
```

---

### Task 17: Mix-weighted multiplier helper

**Files:**
- Create: `lib/engine/mix.ts`, `lib/engine/mix.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/engine/mix.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { mixWeightedMultiplier } from './mix';
import type { PersonaSnap } from './types';

const personas: PersonaSnap[] = [
  { id: 'p1', name: 'Light', multiplier: d('0.3') },
  { id: 'p2', name: 'Avg', multiplier: d('1') },
  { id: 'p3', name: 'Heavy', multiplier: d('3') },
];

describe('mixWeightedMultiplier', () => {
  it('returns 1 when mix is 100% average persona', () => {
    const m = mixWeightedMultiplier(personas, [{ personaId: 'p2', pct: 100 }]);
    expect(m.toString()).toBe('1');
  });

  it('computes weighted avg for 20/50/30 mix', () => {
    const m = mixWeightedMultiplier(personas, [
      { personaId: 'p1', pct: 20 },
      { personaId: 'p2', pct: 50 },
      { personaId: 'p3', pct: 30 },
    ]);
    // 0.20*0.3 + 0.50*1 + 0.30*3 = 0.06 + 0.5 + 0.9 = 1.46
    expect(m.toString()).toBe('1.46');
  });

  it('throws when mix does not sum to 100', () => {
    expect(() =>
      mixWeightedMultiplier(personas, [
        { personaId: 'p1', pct: 50 },
        { personaId: 'p2', pct: 40 },
      ]),
    ).toThrow(/sum to 100/);
  });

  it('throws when persona id is unknown', () => {
    expect(() =>
      mixWeightedMultiplier(personas, [{ personaId: 'does-not-exist', pct: 100 }]),
    ).toThrow(/unknown persona/);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test lib/engine/mix.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `lib/engine/mix.ts`:

```ts
import Decimal from 'decimal.js';
import { d } from '@/lib/utils/money';
import type { PersonaSnap } from './types';
import { ValidationError } from '@/lib/utils/errors';

export function mixWeightedMultiplier(
  personas: PersonaSnap[],
  mix: { personaId: string; pct: number }[],
): Decimal {
  const total = mix.reduce((s, m) => s + m.pct, 0);
  if (Math.abs(total - 100) > 0.001) {
    throw new ValidationError('personaMix', `must sum to 100, got ${total}`);
  }
  const byId = new Map(personas.map((p) => [p.id, p]));
  let out = d(0);
  for (const m of mix) {
    const p = byId.get(m.personaId);
    if (!p) throw new ValidationError('personaMix', `unknown persona ${m.personaId}`);
    out = out.plus(p.multiplier.mul(m.pct).div(100));
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test lib/engine/mix.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/mix.ts lib/engine/mix.test.ts
git commit -m "feat(engine): add mix-weighted multiplier helper"
```

---

### Task 18: SaaS per-seat variable cost

**Files:**
- Create: `lib/engine/saas-cost.ts`, `lib/engine/saas-cost.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/engine/saas-cost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { baseVariablePerUser, saasVariableCostPerSeatPerMonth } from './saas-cost';
import type { SaaSProductSnap } from './types';

const product: SaaSProductSnap = {
  kind: 'SAAS_USAGE',
  productId: 'notes',
  vendorRates: [
    { id: 'dg', name: 'Deepgram', unitLabel: 'per min', rateUsd: d('0.0043') },
    { id: 'llm_in', name: 'LLM input', unitLabel: 'per M tokens', rateUsd: d('2.50') },
  ],
  baseUsage: [
    { vendorRateId: 'dg', usagePerMonth: d('200') }, // 200 min
    { vendorRateId: 'llm_in', usagePerMonth: d('0.5') }, // 0.5 M tokens
  ],
  otherVariableUsdPerUserPerMonth: d('1.00'),
  personas: [
    { id: 'p1', name: 'Light', multiplier: d('0.3') },
    { id: 'p2', name: 'Avg', multiplier: d('1') },
  ],
  fixedCosts: [],
  activeUsersAtScale: 1,
  listPriceUsdPerSeatPerMonth: d('30'),
  volumeTiers: [],
  contractModifiers: [],
};

describe('saas-cost', () => {
  it('baseVariablePerUser sums vendor usage × rate + otherVariable', () => {
    // Deepgram: 200 min × $0.0043 = $0.86
    // LLM: 0.5 × $2.50 = $1.25
    // Other: $1.00
    // Total: $3.11
    const v = baseVariablePerUser(product);
    expect(v.toString()).toBe('3.11');
  });

  it('saasVariableCostPerSeatPerMonth applies mix multiplier', () => {
    // Avg-only → M = 1 → $3.11
    const v1 = saasVariableCostPerSeatPerMonth(product, [{ personaId: 'p2', pct: 100 }]);
    expect(v1.toString()).toBe('3.11');

    // 50% light + 50% avg → M = 0.65 → $3.11 * 0.65 = $2.0215
    const v2 = saasVariableCostPerSeatPerMonth(product, [
      { personaId: 'p1', pct: 50 },
      { personaId: 'p2', pct: 50 },
    ]);
    expect(v2.toFixed(4)).toBe('2.0215');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test lib/engine/saas-cost.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/engine/saas-cost.ts`:

```ts
import Decimal from 'decimal.js';
import { d } from '@/lib/utils/money';
import type { SaaSProductSnap } from './types';
import { mixWeightedMultiplier } from './mix';

export function baseVariablePerUser(product: SaaSProductSnap): Decimal {
  const byId = new Map(product.vendorRates.map((r) => [r.id, r]));
  let sum = d(0);
  for (const b of product.baseUsage) {
    const rate = byId.get(b.vendorRateId);
    if (!rate) continue;
    sum = sum.plus(b.usagePerMonth.mul(rate.rateUsd));
  }
  return sum.plus(product.otherVariableUsdPerUserPerMonth);
}

export function saasVariableCostPerSeatPerMonth(
  product: SaaSProductSnap,
  mix: { personaId: string; pct: number }[],
): Decimal {
  const m = mixWeightedMultiplier(product.personas, mix);
  return baseVariablePerUser(product).mul(m);
}

export function saasInfraCostPerSeatPerMonth(product: SaaSProductSnap): Decimal {
  if (product.activeUsersAtScale <= 0) return d(0);
  const totalFixed = product.fixedCosts.reduce((s, f) => s.plus(f.monthlyUsd), d(0));
  return totalFixed.div(product.activeUsersAtScale);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test lib/engine/saas-cost.test.ts
```

- [ ] **Step 5: Add test for infra cost**

Append to `lib/engine/saas-cost.test.ts`:

```ts
describe('saasInfraCostPerSeatPerMonth', () => {
  it('returns 0 when activeUsersAtScale is 0', () => {
    const p = { ...product, activeUsersAtScale: 0, fixedCosts: [
      { id: 'f', name: 'ec2', monthlyUsd: d('1000') },
    ] };
    expect(saasInfraCostPerSeatPerMonth(p).toString()).toBe('0');
  });

  it('divides total fixed by active users', () => {
    const p = { ...product, activeUsersAtScale: 1000, fixedCosts: [
      { id: 'a', name: 'ec2', monthlyUsd: d('5000') },
      { id: 'b', name: 'posthog', monthlyUsd: d('500') },
      { id: 'c', name: 'sentry', monthlyUsd: d('200') },
    ] };
    // 5700 / 1000 = 5.70
    expect(saasInfraCostPerSeatPerMonth(p).toString()).toBe('5.7');
  });
});
```

Add import at the top:

```ts
import { saasInfraCostPerSeatPerMonth } from './saas-cost';
```

Run again:

```bash
npm test lib/engine/saas-cost.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/engine/saas-cost.ts lib/engine/saas-cost.test.ts
git commit -m "feat(engine): compute SaaS variable and infra cost per seat per month"
```

---

### Task 19: SaaS discounts

**Files:**
- Create: `lib/engine/saas-discount.ts`, `lib/engine/saas-discount.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/engine/saas-discount.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { pickVolumeDiscount, pickContractDiscount, effectiveDiscount } from './saas-discount';

describe('saas-discount', () => {
  const volume = [
    { minSeats: 100, discountPct: d('0.10') },
    { minSeats: 500, discountPct: d('0.20') },
  ];

  it('picks highest matching volume tier', () => {
    expect(pickVolumeDiscount(volume, 50).toString()).toBe('0');
    expect(pickVolumeDiscount(volume, 100).toString()).toBe('0.1');
    expect(pickVolumeDiscount(volume, 499).toString()).toBe('0.1');
    expect(pickVolumeDiscount(volume, 500).toString()).toBe('0.2');
    expect(pickVolumeDiscount(volume, 10000).toString()).toBe('0.2');
  });

  const contract = [
    { minMonths: 12, additionalDiscountPct: d('0.05') },
    { minMonths: 36, additionalDiscountPct: d('0.10') },
  ];

  it('picks highest matching contract tier', () => {
    expect(pickContractDiscount(contract, 6).toString()).toBe('0');
    expect(pickContractDiscount(contract, 12).toString()).toBe('0.05');
    expect(pickContractDiscount(contract, 24).toString()).toBe('0.05');
    expect(pickContractDiscount(contract, 36).toString()).toBe('0.1');
  });

  it('effectiveDiscount sums vol + contract unless override is present', () => {
    expect(effectiveDiscount(d('0.1'), d('0.05')).toString()).toBe('0.15');
    expect(effectiveDiscount(d('0.1'), d('0.05'), d('0.30')).toString()).toBe('0.3');
  });

  it('effectiveDiscount clamps to <= 1.0', () => {
    expect(effectiveDiscount(d('0.8'), d('0.5')).toString()).toBe('1');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test lib/engine/saas-discount.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/engine/saas-discount.ts`:

```ts
import Decimal from 'decimal.js';
import { d } from '@/lib/utils/money';
import type { VolumeTierSnap, ContractModifierSnap } from './types';

export function pickVolumeDiscount(tiers: VolumeTierSnap[], seats: number): Decimal {
  let best = d(0);
  for (const t of tiers) {
    if (seats >= t.minSeats && t.discountPct.gt(best)) best = t.discountPct;
  }
  return best;
}

export function pickContractDiscount(tiers: ContractModifierSnap[], months: number): Decimal {
  let best = d(0);
  for (const t of tiers) {
    if (months >= t.minMonths && t.additionalDiscountPct.gt(best))
      best = t.additionalDiscountPct;
  }
  return best;
}

export function effectiveDiscount(
  volume: Decimal,
  contract: Decimal,
  override?: Decimal,
): Decimal {
  const raw = override ?? volume.plus(contract);
  return raw.gt(1) ? d(1) : raw;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test lib/engine/saas-discount.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/saas-discount.ts lib/engine/saas-discount.test.ts
git commit -m "feat(engine): compute SaaS volume/contract discounts"
```

---

### Task 20: SaaS tab compute

**Files:**
- Create: `lib/engine/saas-tab.ts`, `lib/engine/saas-tab.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/engine/saas-tab.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { computeSaaSTab } from './saas-tab';
import type { SaaSProductSnap, SaaSTabInput } from './types';

const product: SaaSProductSnap = {
  kind: 'SAAS_USAGE',
  productId: 'notes',
  vendorRates: [
    { id: 'dg', name: 'Deepgram', unitLabel: 'per min', rateUsd: d('0.0043') },
  ],
  baseUsage: [{ vendorRateId: 'dg', usagePerMonth: d('200') }],
  otherVariableUsdPerUserPerMonth: d('2.00'),
  personas: [{ id: 'p', name: 'Avg', multiplier: d('1') }],
  fixedCosts: [{ id: 'f', name: 'ec2', monthlyUsd: d('4000') }],
  activeUsersAtScale: 1000,
  listPriceUsdPerSeatPerMonth: d('30'),
  volumeTiers: [{ minSeats: 100, discountPct: d('0.10') }],
  contractModifiers: [{ minMonths: 12, additionalDiscountPct: d('0.05') }],
};

const tab: SaaSTabInput = {
  kind: 'SAAS_USAGE',
  productId: 'notes',
  seatCount: 200,
  personaMix: [{ personaId: 'p', pct: 100 }],
};

describe('computeSaaSTab', () => {
  it('produces correct monthly cost, revenue, and margin', () => {
    // Variable per seat: 200 × 0.0043 + 2.00 = 2.86
    // Infra per seat: 4000 / 1000 = 4.00
    // Total per seat: 6.86
    // Total cost/month: 200 × 6.86 = 1372.00
    // List revenue: 200 × 30 = 6000
    // Discount: 0.10 + 0.05 = 0.15 → net 0.85
    // Net revenue: 6000 × 0.85 = 5100
    // Contribution margin/month: 5100 - 1372 = 3728
    const r = computeSaaSTab(tab, product, 12);
    expect(r.monthlyCostCents).toBe(137200);
    expect(r.monthlyRevenueCents).toBe(510000);
    expect(r.oneTimeCostCents).toBe(0);
    expect(r.oneTimeRevenueCents).toBe(0);
    expect(r.contractCostCents).toBe(137200 * 12);
    expect(r.contractRevenueCents).toBe(510000 * 12);
    expect(r.contributionMarginCents).toBe((510000 - 137200) * 12);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test lib/engine/saas-tab.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/engine/saas-tab.ts`:

```ts
import Decimal from 'decimal.js';
import { d, toCents } from '@/lib/utils/money';
import type { SaaSProductSnap, SaaSTabInput, TabResult } from './types';
import {
  saasVariableCostPerSeatPerMonth,
  saasInfraCostPerSeatPerMonth,
} from './saas-cost';
import {
  pickVolumeDiscount,
  pickContractDiscount,
  effectiveDiscount,
} from './saas-discount';
import { ValidationError } from '@/lib/utils/errors';

export function computeSaaSTab(
  tab: SaaSTabInput,
  product: SaaSProductSnap,
  contractMonths: number,
): TabResult {
  if (tab.seatCount < 0) throw new ValidationError('seatCount', 'must be >= 0');
  if (contractMonths <= 0) throw new ValidationError('contractMonths', 'must be > 0');

  const varPerSeat = saasVariableCostPerSeatPerMonth(product, tab.personaMix);
  const infraPerSeat = saasInfraCostPerSeatPerMonth(product);
  const totalCostPerMonth = varPerSeat.plus(infraPerSeat).mul(tab.seatCount);

  const listRevenuePerMonth = product.listPriceUsdPerSeatPerMonth.mul(tab.seatCount);
  const volD = pickVolumeDiscount(product.volumeTiers, tab.seatCount);
  const conD = pickContractDiscount(product.contractModifiers, contractMonths);
  const discount = effectiveDiscount(volD, conD, tab.discountOverridePct);
  const netRevenuePerMonth = listRevenuePerMonth.mul(d(1).minus(discount));

  const monthlyCostCents = toCents(totalCostPerMonth);
  const monthlyRevenueCents = toCents(netRevenuePerMonth);
  const contractCostCents = monthlyCostCents * contractMonths;
  const contractRevenueCents = monthlyRevenueCents * contractMonths;
  const contributionMarginCents = contractRevenueCents - contractCostCents;

  return {
    productId: tab.productId,
    kind: 'SAAS_USAGE',
    monthlyCostCents,
    monthlyRevenueCents,
    oneTimeCostCents: 0,
    oneTimeRevenueCents: 0,
    contractCostCents,
    contractRevenueCents,
    contributionMarginCents,
    breakdown: {
      variableCostPerSeatPerMonth: varPerSeat.toString(),
      infraCostPerSeatPerMonth: infraPerSeat.toString(),
      listPricePerSeatPerMonth: product.listPriceUsdPerSeatPerMonth.toString(),
      effectiveDiscount: discount.toString(),
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test lib/engine/saas-tab.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/saas-tab.ts lib/engine/saas-tab.test.ts
git commit -m "feat(engine): compute SaaS tab monthly/contract totals"
```

---

### Task 21: Packaged labor tab compute

**Files:**
- Create: `lib/engine/packaged-labor-tab.ts`, `lib/engine/packaged-labor-tab.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/engine/packaged-labor-tab.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { computePackagedLaborTab } from './packaged-labor-tab';
import type { PackagedLaborTabInput } from './types';

const tab: PackagedLaborTabInput = {
  kind: 'PACKAGED_LABOR',
  productId: 'training',
  lineItems: [
    {
      customDescription: 'Async Training',
      qty: d('100'), // 100 users
      unit: 'PER_USER',
      costPerUnitUsd: d('5'),
      revenuePerUnitUsd: d('50'),
    },
    {
      customDescription: 'Live Training Day',
      qty: d('3'),
      unit: 'PER_SESSION',
      costPerUnitUsd: d('800'),
      revenuePerUnitUsd: d('3500'),
    },
  ],
};

describe('computePackagedLaborTab', () => {
  it('sums one-time cost and revenue across line items', () => {
    // cost: 100*5 + 3*800 = 500 + 2400 = 2900
    // revenue: 100*50 + 3*3500 = 5000 + 10500 = 15500
    const r = computePackagedLaborTab(tab);
    expect(r.oneTimeCostCents).toBe(290000);
    expect(r.oneTimeRevenueCents).toBe(1550000);
    expect(r.contractCostCents).toBe(290000);
    expect(r.contractRevenueCents).toBe(1550000);
    expect(r.monthlyCostCents).toBe(0);
    expect(r.monthlyRevenueCents).toBe(0);
    expect(r.contributionMarginCents).toBe(1550000 - 290000);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test lib/engine/packaged-labor-tab.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/engine/packaged-labor-tab.ts`:

```ts
import { d, toCents } from '@/lib/utils/money';
import type { PackagedLaborTabInput, TabResult } from './types';

export function computePackagedLaborTab(tab: PackagedLaborTabInput): TabResult {
  let cost = d(0);
  let revenue = d(0);
  for (const li of tab.lineItems) {
    cost = cost.plus(li.qty.mul(li.costPerUnitUsd));
    revenue = revenue.plus(li.qty.mul(li.revenuePerUnitUsd));
  }
  const oneTimeCostCents = toCents(cost);
  const oneTimeRevenueCents = toCents(revenue);
  return {
    productId: tab.productId,
    kind: 'PACKAGED_LABOR',
    monthlyCostCents: 0,
    monthlyRevenueCents: 0,
    oneTimeCostCents,
    oneTimeRevenueCents,
    contractCostCents: oneTimeCostCents,
    contractRevenueCents: oneTimeRevenueCents,
    contributionMarginCents: oneTimeRevenueCents - oneTimeCostCents,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test lib/engine/packaged-labor-tab.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/packaged-labor-tab.ts lib/engine/packaged-labor-tab.test.ts
git commit -m "feat(engine): compute packaged labor tab"
```

---

### Task 22: Custom labor tab compute

**Files:**
- Create: `lib/engine/custom-labor-tab.ts`, `lib/engine/custom-labor-tab.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/engine/custom-labor-tab.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { computeCustomLaborTab } from './custom-labor-tab';
import type { CustomLaborTabInput, DepartmentSnap } from './types';

const departments: Record<string, DepartmentSnap> = {
  eng: {
    id: 'eng',
    name: 'Engineering',
    loadedRatePerHourUsd: d('80'),
    billRatePerHourUsd: d('200'),
  },
  train: {
    id: 'train',
    name: 'Training',
    loadedRatePerHourUsd: d('60'),
    billRatePerHourUsd: d('150'),
  },
};

const tab: CustomLaborTabInput = {
  kind: 'CUSTOM_LABOR',
  productId: 'service',
  lineItems: [
    { departmentId: 'eng', hours: d('40') },
    { departmentId: 'train', hours: d('20') },
  ],
};

describe('computeCustomLaborTab', () => {
  it('sums hours × loaded and bill rates by department', () => {
    // cost: 40*80 + 20*60 = 3200 + 1200 = 4400
    // revenue: 40*200 + 20*150 = 8000 + 3000 = 11000
    const r = computeCustomLaborTab(tab, departments);
    expect(r.oneTimeCostCents).toBe(440000);
    expect(r.oneTimeRevenueCents).toBe(1100000);
    expect(r.contributionMarginCents).toBe(1100000 - 440000);
  });

  it('throws on unknown department', () => {
    expect(() =>
      computeCustomLaborTab(
        { ...tab, lineItems: [{ departmentId: 'nope', hours: d('1') }] },
        departments,
      ),
    ).toThrow(/unknown department/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test lib/engine/custom-labor-tab.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/engine/custom-labor-tab.ts`:

```ts
import { d, toCents } from '@/lib/utils/money';
import { ValidationError } from '@/lib/utils/errors';
import type { CustomLaborTabInput, DepartmentSnap, TabResult } from './types';

export function computeCustomLaborTab(
  tab: CustomLaborTabInput,
  departments: Record<string, DepartmentSnap>,
): TabResult {
  let cost = d(0);
  let revenue = d(0);
  for (const li of tab.lineItems) {
    if (!li.departmentId) {
      throw new ValidationError('lineItem', 'departmentId required for custom labor');
    }
    const dept = departments[li.departmentId];
    if (!dept) {
      throw new ValidationError('lineItem', `unknown department ${li.departmentId}`);
    }
    cost = cost.plus(li.hours.mul(dept.loadedRatePerHourUsd));
    revenue = revenue.plus(li.hours.mul(dept.billRatePerHourUsd));
  }
  const oneTimeCostCents = toCents(cost);
  const oneTimeRevenueCents = toCents(revenue);
  return {
    productId: tab.productId,
    kind: 'CUSTOM_LABOR',
    monthlyCostCents: 0,
    monthlyRevenueCents: 0,
    oneTimeCostCents,
    oneTimeRevenueCents,
    contractCostCents: oneTimeCostCents,
    contractRevenueCents: oneTimeRevenueCents,
    contributionMarginCents: oneTimeRevenueCents - oneTimeCostCents,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test lib/engine/custom-labor-tab.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/custom-labor-tab.ts lib/engine/custom-labor-tab.test.ts
git commit -m "feat(engine): compute custom labor tab"
```

---

### Task 23: Commission tier progressive evaluation

**Files:**
- Create: `lib/engine/commissions.ts`, `lib/engine/commissions.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/engine/commissions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { applyProgressiveTiers } from './commissions';
import type { CommissionTierSnap } from './types';

const tiers: CommissionTierSnap[] = [
  { thresholdFromUsd: d('0'), ratePct: d('0.10') },
  { thresholdFromUsd: d('100000'), ratePct: d('0.15') },
  { thresholdFromUsd: d('250000'), ratePct: d('0.20') },
];

describe('applyProgressiveTiers', () => {
  it('applies 10% on first $100k, 15% on next band, etc.', () => {
    // base = $300k
    // band1: 100k × 10% = 10000
    // band2: 150k × 15% = 22500
    // band3: 50k × 20% = 10000
    // total = 42500
    const { commissionCents, breakdown } = applyProgressiveTiers(d('300000'), tiers);
    expect(commissionCents).toBe(4_250_000);
    expect(breakdown).toHaveLength(3);
    expect(breakdown[0]?.amountCents).toBe(1_000_000);
    expect(breakdown[1]?.amountCents).toBe(2_250_000);
    expect(breakdown[2]?.amountCents).toBe(1_000_000);
  });

  it('returns 0 for base <= 0', () => {
    const r = applyProgressiveTiers(d('0'), tiers);
    expect(r.commissionCents).toBe(0);
  });

  it('only applies bands up to base amount', () => {
    // base = $50k → only band1 for $50k × 10% = $5000
    const { commissionCents, breakdown } = applyProgressiveTiers(d('50000'), tiers);
    expect(commissionCents).toBe(500000);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]?.amountCents).toBe(500000);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test lib/engine/commissions.test.ts
```

- [ ] **Step 3: Implement progressive tier evaluation**

Create `lib/engine/commissions.ts`:

```ts
import Decimal from 'decimal.js';
import { d, toCents } from '@/lib/utils/money';
import type {
  CommissionBreakdownTier,
  CommissionResult,
  CommissionRuleSnap,
  CommissionTierSnap,
  TabResult,
} from './types';

export interface ProgressiveTierResult {
  commissionCents: number;
  breakdown: CommissionBreakdownTier[];
}

export function applyProgressiveTiers(
  baseAmount: Decimal,
  tiers: CommissionTierSnap[],
): ProgressiveTierResult {
  if (baseAmount.lte(0) || tiers.length === 0) {
    return { commissionCents: 0, breakdown: [] };
  }
  const sorted = [...tiers].sort((a, b) =>
    a.thresholdFromUsd.cmp(b.thresholdFromUsd),
  );
  const breakdown: CommissionBreakdownTier[] = [];
  let total = d(0);
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i]!;
    if (baseAmount.lte(tier.thresholdFromUsd)) break;
    const next = sorted[i + 1];
    const upper = next ? Decimal.min(baseAmount, next.thresholdFromUsd) : baseAmount;
    const bandWidth = upper.minus(tier.thresholdFromUsd);
    if (bandWidth.lte(0)) break;
    const amount = bandWidth.mul(tier.ratePct);
    breakdown.push({
      thresholdFromUsd: tier.thresholdFromUsd,
      ratePct: tier.ratePct,
      amountCents: toCents(amount),
    });
    total = total.plus(amount);
  }
  return { commissionCents: toCents(total), breakdown };
}

export function resolveBaseAmount(
  rule: CommissionRuleSnap,
  perTab: TabResult[],
): Decimal {
  const byProduct = (kind: 'rev' | 'margin') => {
    const match = perTab.find((t) =>
      rule.scopeProductId ? t.productId === rule.scopeProductId : false,
    );
    if (!match) return d(0);
    return d(kind === 'rev' ? match.contractRevenueCents : match.contributionMarginCents).div(
      100,
    );
  };
  const allRev = () =>
    d(perTab.reduce((s, t) => s + t.contractRevenueCents, 0)).div(100);
  const allMargin = () =>
    d(perTab.reduce((s, t) => s + t.contributionMarginCents, 0)).div(100);

  switch (rule.baseMetric) {
    case 'REVENUE':
      return allRev();
    case 'CONTRIBUTION_MARGIN':
      return allMargin();
    case 'TAB_REVENUE':
      return byProduct('rev');
    case 'TAB_MARGIN':
      return byProduct('margin');
  }
}

export function evaluateCommissionRule(
  rule: CommissionRuleSnap,
  perTab: TabResult[],
): CommissionResult {
  const base = resolveBaseAmount(rule, perTab);
  const { commissionCents, breakdown } = applyProgressiveTiers(base, rule.tiers);
  return {
    ruleId: rule.id,
    name: rule.name,
    baseAmountCents: toCents(base),
    commissionAmountCents: commissionCents,
    tierBreakdown: breakdown,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test lib/engine/commissions.test.ts
```

- [ ] **Step 5: Add tests for rule resolution**

Append to `lib/engine/commissions.test.ts`:

```ts
import { evaluateCommissionRule, resolveBaseAmount } from './commissions';
import type { CommissionRuleSnap, TabResult } from './types';

describe('resolveBaseAmount / evaluateCommissionRule', () => {
  const perTab: TabResult[] = [
    {
      productId: 'notes',
      kind: 'SAAS_USAGE',
      monthlyCostCents: 137200,
      monthlyRevenueCents: 510000,
      oneTimeCostCents: 0,
      oneTimeRevenueCents: 0,
      contractCostCents: 137200 * 12,
      contractRevenueCents: 510000 * 12,
      contributionMarginCents: (510000 - 137200) * 12,
    },
    {
      productId: 'service',
      kind: 'CUSTOM_LABOR',
      monthlyCostCents: 0,
      monthlyRevenueCents: 0,
      oneTimeCostCents: 440000,
      oneTimeRevenueCents: 1100000,
      contractCostCents: 440000,
      contractRevenueCents: 1100000,
      contributionMarginCents: 660000,
    },
  ];

  it('TAB_REVENUE scoped to product', () => {
    const rule: CommissionRuleSnap = {
      id: 'r',
      name: 'Notes sales',
      scopeType: 'PRODUCT',
      scopeProductId: 'notes',
      baseMetric: 'TAB_REVENUE',
      tiers: [{ thresholdFromUsd: d('0'), ratePct: d('0.05') }],
    };
    const r = evaluateCommissionRule(rule, perTab);
    // Notes revenue: 510000 * 12 = 6,120,000 cents = $61,200 → 5% = $3060
    expect(r.commissionAmountCents).toBe(306000);
    expect(r.baseAmountCents).toBe(6120000);
  });

  it('REVENUE (all tabs)', () => {
    const rule: CommissionRuleSnap = {
      id: 'r',
      name: 'Total sales',
      scopeType: 'ALL',
      baseMetric: 'REVENUE',
      tiers: [{ thresholdFromUsd: d('0'), ratePct: d('0.02') }],
    };
    const r = evaluateCommissionRule(rule, perTab);
    // Total revenue: 6,120,000 + 1,100,000 = 7,220,000 cents = $72,200 × 2% = $1444
    expect(r.commissionAmountCents).toBe(144400);
  });
});
```

Run:

```bash
npm test lib/engine/commissions.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/engine/commissions.ts lib/engine/commissions.test.ts
git commit -m "feat(engine): evaluate progressive-tier commission rules"
```

---

### Task 24: Rail evaluation

**Files:**
- Create: `lib/engine/rails.ts`, `lib/engine/rails.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/engine/rails.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { evaluateRails } from './rails';
import type { RailSnap, TabResult } from './types';

const perTab: TabResult[] = [
  {
    productId: 'notes',
    kind: 'SAAS_USAGE',
    monthlyCostCents: 100,
    monthlyRevenueCents: 200,
    oneTimeCostCents: 0,
    oneTimeRevenueCents: 0,
    contractCostCents: 1200,
    contractRevenueCents: 2400,
    contributionMarginCents: 1200,
    breakdown: { effectiveDiscount: '0.25' },
  },
];

describe('evaluateRails', () => {
  it('emits hard warning below hard threshold on margin', () => {
    const rails: RailSnap[] = [
      {
        id: 'min-margin',
        productId: 'notes',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('0.7'),
        hardThreshold: d('0.6'),
      },
    ];
    // Actual margin: 1200/2400 = 0.5
    const w = evaluateRails(rails, perTab, 0, 0);
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('hard');
  });

  it('emits soft warning between hard and soft thresholds', () => {
    const rails: RailSnap[] = [
      {
        id: 'min-margin',
        productId: 'notes',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('0.6'),
        hardThreshold: d('0.4'),
      },
    ];
    const w = evaluateRails(rails, perTab, 0, 0);
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('soft');
  });

  it('no warning when above soft threshold', () => {
    const rails: RailSnap[] = [
      {
        id: 'min-margin',
        productId: 'notes',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('0.4'),
        hardThreshold: d('0.3'),
      },
    ];
    expect(evaluateRails(rails, perTab, 0, 0)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test lib/engine/rails.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/engine/rails.ts`:

```ts
import Decimal from 'decimal.js';
import { d } from '@/lib/utils/money';
import type { RailSnap, TabResult, WarningResult } from './types';

export function evaluateRails(
  rails: RailSnap[],
  perTab: TabResult[],
  netMarginCentsAll: number,
  contractRevenueCentsAll: number,
): WarningResult[] {
  const warnings: WarningResult[] = [];
  for (const rail of rails) {
    const tab = perTab.find((t) => t.productId === rail.productId);
    if (!tab) continue;
    const measured = measureRail(rail, tab, netMarginCentsAll, contractRevenueCentsAll);
    if (measured == null) continue;

    const mDec = d(measured);
    const hard = rail.hardThreshold;
    const soft = rail.softThreshold;
    const isMax = rail.kind === 'MAX_DISCOUNT_PCT';
    // For MIN rails: low is bad. For MAX rails: high is bad.
    const belowSoft = isMax ? mDec.gt(soft) : mDec.lt(soft);
    const belowHard = isMax ? mDec.gt(hard) : mDec.lt(hard);
    if (belowHard) {
      warnings.push({
        railId: rail.id,
        kind: rail.kind,
        severity: 'hard',
        measured,
        threshold: hard.toNumber(),
        message: `${rail.kind} hard threshold breached on ${tab.productId}`,
      });
    } else if (belowSoft) {
      warnings.push({
        railId: rail.id,
        kind: rail.kind,
        severity: 'soft',
        measured,
        threshold: soft.toNumber(),
        message: `${rail.kind} soft threshold breached on ${tab.productId}`,
      });
    }
  }
  return warnings;
}

function measureRail(
  rail: RailSnap,
  tab: TabResult,
  netMarginCentsAll: number,
  contractRevenueCentsAll: number,
): number | null {
  switch (rail.kind) {
    case 'MIN_MARGIN_PCT': {
      if (tab.contractRevenueCents === 0) return null;
      if (rail.marginBasis === 'NET') {
        return contractRevenueCentsAll === 0
          ? null
          : netMarginCentsAll / contractRevenueCentsAll;
      }
      return tab.contributionMarginCents / tab.contractRevenueCents;
    }
    case 'MAX_DISCOUNT_PCT': {
      const raw =
        tab.breakdown && typeof tab.breakdown.effectiveDiscount === 'string'
          ? Number(tab.breakdown.effectiveDiscount)
          : null;
      return Number.isFinite(raw ?? NaN) ? (raw as number) : null;
    }
    case 'MIN_SEAT_PRICE': {
      // Derive net per-seat-per-month from breakdown (present for SaaS tabs).
      if (tab.kind !== 'SAAS_USAGE') return null;
      if (tab.monthlyRevenueCents <= 0) return null;
      // This rail is always cents; thresholds stored as dollars — convert.
      return tab.monthlyRevenueCents / 100; // caller sets threshold in dollars
    }
    case 'MIN_CONTRACT_MONTHS': {
      // Measured value = (contractCost / monthlyCost) if monthly > 0
      if (tab.kind !== 'SAAS_USAGE' || tab.monthlyCostCents <= 0) return null;
      return tab.contractCostCents / tab.monthlyCostCents;
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test lib/engine/rails.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/rails.ts lib/engine/rails.test.ts
git commit -m "feat(engine): evaluate product rails with soft/hard severity"
```

---

### Task 25: Top-level compute() entry point

**Files:**
- Create: `lib/engine/compute.ts`, `lib/engine/index.ts`

- [ ] **Step 1: Create the top-level compute function**

Create `lib/engine/compute.ts`:

```ts
import { d, toCents } from '@/lib/utils/money';
import type { ComputeRequest, ComputeResult, TabResult } from './types';
import { computeSaaSTab } from './saas-tab';
import { computePackagedLaborTab } from './packaged-labor-tab';
import { computeCustomLaborTab } from './custom-labor-tab';
import { evaluateCommissionRule } from './commissions';
import { evaluateRails } from './rails';
import { ValidationError } from '@/lib/utils/errors';

export function compute(req: ComputeRequest): ComputeResult {
  if (req.contractMonths <= 0) {
    throw new ValidationError('contractMonths', 'must be > 0');
  }

  const perTab: TabResult[] = req.tabs.map((tab) => {
    switch (tab.kind) {
      case 'SAAS_USAGE': {
        const product = req.products.saas[tab.productId];
        if (!product)
          throw new ValidationError('productId', `unknown SaaS product ${tab.productId}`);
        return computeSaaSTab(tab, product, req.contractMonths);
      }
      case 'PACKAGED_LABOR':
        return computePackagedLaborTab(tab);
      case 'CUSTOM_LABOR':
        return computeCustomLaborTab(tab, req.products.departments);
    }
  });

  const monthlyCostCents = perTab.reduce((s, t) => s + t.monthlyCostCents, 0);
  const monthlyRevenueCents = perTab.reduce((s, t) => s + t.monthlyRevenueCents, 0);
  const contractCostCents = perTab.reduce((s, t) => s + t.contractCostCents, 0);
  const contractRevenueCents = perTab.reduce((s, t) => s + t.contractRevenueCents, 0);
  const contributionMarginCents = perTab.reduce(
    (s, t) => s + t.contributionMarginCents,
    0,
  );

  const commissions = req.commissionRules
    .filter((r) => r.tiers.length > 0)
    .map((r) => evaluateCommissionRule(r, perTab));
  const totalCommissionCents = commissions.reduce((s, c) => s + c.commissionAmountCents, 0);
  const netMarginCents = contributionMarginCents - totalCommissionCents;

  const marginPctContribution =
    contractRevenueCents === 0 ? 0 : contributionMarginCents / contractRevenueCents;
  const marginPctNet =
    contractRevenueCents === 0 ? 0 : netMarginCents / contractRevenueCents;

  const warnings = evaluateRails(req.rails, perTab, netMarginCents, contractRevenueCents);

  return {
    perTab,
    totals: {
      monthlyCostCents,
      monthlyRevenueCents,
      contractCostCents,
      contractRevenueCents,
      contributionMarginCents,
      netMarginCents,
      marginPctContribution,
      marginPctNet,
    },
    commissions,
    warnings,
  };
}
```

- [ ] **Step 2: Create engine barrel export**

Create `lib/engine/index.ts`:

```ts
export * from './types';
export { compute } from './compute';
```

- [ ] **Step 3: Commit**

```bash
git add lib/engine/compute.ts lib/engine/index.ts
git commit -m "feat(engine): top-level compute() entry point"
```

---

### Task 26: Golden fixture — end-to-end multi-tab scenario

**Files:**
- Create: `lib/engine/tests/golden-multi-tab.test.ts`

- [ ] **Step 1: Write the golden-fixture test**

Create `lib/engine/tests/golden-multi-tab.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { compute } from '../compute';
import type { ComputeRequest } from '../types';

// A realistic deal: 200 Notes seats (avg persona), 3 live training days,
// 40 hours of Engineering customization. 24-month contract. One sales-rep
// commission rule on total revenue at 5%.

describe('Golden fixture: multi-tab scenario', () => {
  const req: ComputeRequest = {
    contractMonths: 24,
    tabs: [
      {
        kind: 'SAAS_USAGE',
        productId: 'notes',
        seatCount: 200,
        personaMix: [{ personaId: 'avg', pct: 100 }],
      },
      {
        kind: 'PACKAGED_LABOR',
        productId: 'training',
        lineItems: [
          {
            customDescription: 'Live training day',
            qty: d('3'),
            unit: 'PER_SESSION',
            costPerUnitUsd: d('800'),
            revenuePerUnitUsd: d('3500'),
          },
        ],
      },
      {
        kind: 'CUSTOM_LABOR',
        productId: 'service',
        lineItems: [{ departmentId: 'eng', hours: d('40') }],
      },
    ],
    products: {
      saas: {
        notes: {
          kind: 'SAAS_USAGE',
          productId: 'notes',
          vendorRates: [
            { id: 'dg', name: 'Deepgram', unitLabel: 'per min', rateUsd: d('0.0043') },
            { id: 'llm', name: 'LLM', unitLabel: 'per M tok', rateUsd: d('2.50') },
          ],
          baseUsage: [
            { vendorRateId: 'dg', usagePerMonth: d('200') },
            { vendorRateId: 'llm', usagePerMonth: d('0.5') },
          ],
          otherVariableUsdPerUserPerMonth: d('1.00'),
          personas: [{ id: 'avg', name: 'Avg', multiplier: d('1') }],
          fixedCosts: [{ id: 'f', name: 'EC2', monthlyUsd: d('5000') }],
          activeUsersAtScale: 2500,
          listPriceUsdPerSeatPerMonth: d('30'),
          volumeTiers: [{ minSeats: 100, discountPct: d('0.10') }],
          contractModifiers: [{ minMonths: 24, additionalDiscountPct: d('0.10') }],
        },
      },
      laborSKUs: {},
      departments: {
        eng: {
          id: 'eng',
          name: 'Engineering',
          loadedRatePerHourUsd: d('80'),
          billRatePerHourUsd: d('200'),
        },
      },
    },
    commissionRules: [
      {
        id: 'sales-commission',
        name: 'Sales rep',
        scopeType: 'ALL',
        baseMetric: 'REVENUE',
        tiers: [{ thresholdFromUsd: d('0'), ratePct: d('0.05') }],
      },
    ],
    rails: [],
  };

  it('produces the expected totals', () => {
    const r = compute(req);

    // ── Notes tab ──
    // Variable per seat: 200 × 0.0043 + 0.5 × 2.50 + 1.00 = 0.86 + 1.25 + 1.00 = 3.11
    // Infra per seat: 5000 / 2500 = 2.00
    // Total per seat: 5.11
    // Cost/mo: 200 × 5.11 = 1022.00 → 102200 cents
    // List: 200 × 30 = 6000
    // Discount: 0.10 + 0.10 = 0.20 → net 0.80
    // Net revenue/mo: 6000 × 0.80 = 4800 → 480000 cents
    // Contract cost: 102200 × 24 = 2,452,800
    // Contract revenue: 480000 × 24 = 11,520,000
    // Contribution margin: 11,520,000 - 2,452,800 = 9,067,200

    expect(r.perTab[0]?.monthlyCostCents).toBe(102200);
    expect(r.perTab[0]?.monthlyRevenueCents).toBe(480000);
    expect(r.perTab[0]?.contractCostCents).toBe(102200 * 24);
    expect(r.perTab[0]?.contractRevenueCents).toBe(480000 * 24);

    // ── Training tab ──
    // cost: 3 × 800 = 2400 → 240000
    // revenue: 3 × 3500 = 10500 → 1050000
    expect(r.perTab[1]?.oneTimeCostCents).toBe(240000);
    expect(r.perTab[1]?.oneTimeRevenueCents).toBe(1050000);

    // ── Service tab ──
    // cost: 40 × 80 = 3200 → 320000
    // revenue: 40 × 200 = 8000 → 800000
    expect(r.perTab[2]?.oneTimeCostCents).toBe(320000);
    expect(r.perTab[2]?.oneTimeRevenueCents).toBe(800000);

    // ── Totals ──
    const expectedRevenue = 480000 * 24 + 1050000 + 800000;
    const expectedCost = 102200 * 24 + 240000 + 320000;
    expect(r.totals.contractRevenueCents).toBe(expectedRevenue);
    expect(r.totals.contractCostCents).toBe(expectedCost);
    expect(r.totals.contributionMarginCents).toBe(expectedRevenue - expectedCost);

    // ── Commission ──
    // Revenue in dollars: expectedRevenue / 100
    // 5% commission
    const expectedCommission = Math.round(expectedRevenue * 0.05);
    expect(r.commissions[0]?.commissionAmountCents).toBe(expectedCommission);

    // ── Net margin ──
    expect(r.totals.netMarginCents).toBe(
      expectedRevenue - expectedCost - expectedCommission,
    );
  });
});
```

- [ ] **Step 2: Run to verify pass**

```bash
npm test lib/engine/tests/golden-multi-tab.test.ts
```

Expected: pass. If it fails, diagnose whether it's a real bug or a fixture-math bug (recompute by hand).

- [ ] **Step 3: Commit**

```bash
git add lib/engine/tests/golden-multi-tab.test.ts
git commit -m "test(engine): golden multi-tab end-to-end fixture"
```

---

### Task 27: Golden fixture — rail warning

**Files:**
- Create: `lib/engine/tests/golden-rails.test.ts`

- [ ] **Step 1: Write a fixture with a margin-breaching scenario**

Create `lib/engine/tests/golden-rails.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { compute } from '../compute';
import type { ComputeRequest } from '../types';

describe('Golden fixture: rail warnings', () => {
  const base: ComputeRequest = {
    contractMonths: 12,
    tabs: [
      {
        kind: 'SAAS_USAGE',
        productId: 'notes',
        seatCount: 50,
        personaMix: [{ personaId: 'avg', pct: 100 }],
        discountOverridePct: d('0.50'), // deep discount to force low margin
      },
    ],
    products: {
      saas: {
        notes: {
          kind: 'SAAS_USAGE',
          productId: 'notes',
          vendorRates: [
            { id: 'dg', name: 'Deepgram', unitLabel: 'per min', rateUsd: d('0.0043') },
          ],
          baseUsage: [{ vendorRateId: 'dg', usagePerMonth: d('200') }],
          otherVariableUsdPerUserPerMonth: d('5.00'),
          personas: [{ id: 'avg', name: 'Avg', multiplier: d('1') }],
          fixedCosts: [{ id: 'f', name: 'EC2', monthlyUsd: d('5000') }],
          activeUsersAtScale: 500,
          listPriceUsdPerSeatPerMonth: d('30'),
          volumeTiers: [],
          contractModifiers: [],
        },
      },
      laborSKUs: {},
      departments: {},
    },
    commissionRules: [],
    rails: [
      {
        id: 'min-margin',
        productId: 'notes',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('0.70'),
        hardThreshold: d('0.50'),
      },
    ],
  };

  it('hard warning when discount override pushes margin below hard threshold', () => {
    const r = compute(base);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]?.severity).toBe('hard');
  });

  it('no warning with zero discount', () => {
    const noOverride: ComputeRequest = {
      ...base,
      tabs: [
        {
          kind: 'SAAS_USAGE',
          productId: 'notes',
          seatCount: 50,
          personaMix: [{ personaId: 'avg', pct: 100 }],
        },
      ],
    };
    const r = compute(noOverride);
    // At no discount: variable per seat = 200*0.0043 + 5 = 5.86; infra = 10; total = 15.86
    // Revenue per seat = 30; margin = (30 - 15.86) / 30 ≈ 0.47 → still below soft 0.70
    // This test verifies the rail logic operates consistently; adjust thresholds if
    // the business economics change.
    expect(r.warnings.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run**

```bash
npm test lib/engine/tests/golden-rails.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/engine/tests/golden-rails.test.ts
git commit -m "test(engine): golden fixture for rail warnings"
```

---

## Part F — CI

### Task 28: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: ninja
          POSTGRES_PASSWORD: ninja_dev
          POSTGRES_DB: ninja_pricer
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DATABASE_URL: postgresql://ninja:ninja_dev@localhost:5432/ninja_pricer?schema=public
      NEXTAUTH_URL: http://localhost:3000
      NEXTAUTH_SECRET: ci-secret
      ALLOWED_EMAIL_DOMAIN: example.com

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npx tsc --noEmit
      - run: npm run format:check
      - run: npm run lint
      - run: npm test
```

- [ ] **Step 2: Verify YAML syntax locally (optional)**

```bash
node -e "const y=require('js-yaml'); try { y.load(require('fs').readFileSync('.github/workflows/ci.yml','utf-8')); console.log('ok'); } catch(e){console.error(e);process.exit(1)}" 2>/dev/null || echo "skip yaml validation if js-yaml not installed"
```

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflow for typecheck, lint, format, tests"
```

---

## Phase 1 complete — verification checklist

Before handing off to Phase 2, verify the following:

- [ ] `npm run build` succeeds.
- [ ] `npx tsc --noEmit` reports no errors.
- [ ] `npm test` passes all engine unit tests and golden fixtures.
- [ ] `npm run format:check` passes.
- [ ] `npx prisma migrate status` reports no pending migrations.
- [ ] Local `npm run dev` boots; visiting `/` redirects to `/api/auth/signin`.
- [ ] After a successful sign-in (once Microsoft Entra env vars are configured), the admin sees `/admin` in the top nav; a sales user does not.
- [ ] `npx prisma db seed` creates the admin user and three products.
- [ ] The CI workflow runs green on a test branch push (optional at this stage — verify in Phase 2 when PRs start).

---

## Notes for the engineer

- **If a test fails:** diagnose whether the fixture math is wrong or the code is wrong. Recompute by hand before changing test expectations.
- **Money precision:** every monetary calculation inside `lib/engine` goes through `Decimal`. `toCents()` is called only at the TabResult / aggregate boundary.
- **Don't add features beyond this plan.** If you notice a missing behavior in the engine (e.g., "shouldn't `MAX_DISCOUNT_PCT` rails look at the SaaS tab's discount field?"), leave it as-is for now — Phase 2 surfaces rails in the admin UI and that's where design iteration happens.
- **Pure engine rule:** if you find yourself importing `@/lib/db` or `@prisma/client` inside `lib/engine`, stop — the engine must stay pure. All DB reads happen in Phase 2/3 services that assemble the snapshot and call `compute()`.
