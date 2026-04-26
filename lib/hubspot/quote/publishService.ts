/**
 * Shared publish orchestration — used by the MCP tool handlers and the Next.js
 * server actions so the line-item build + publish call stays DRY.
 */
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db/client';
import { HubSpotApprovalStatus, HubSpotPublishState } from '@prisma/client';
import { computeScenario } from '@/lib/services/rateSnapshot';
import { scenarioToHubSpotLineItems } from './translator';
import { publishScenarioToHubSpot, MissingDealLinkError, type PublishPersistence } from './publish';
import { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';
import { HubSpotApprovalRequestRepository } from '@/lib/db/repositories/hubspotApprovalRequest';
import { submitApprovalRequest, type ApprovalPersistence } from '@/lib/hubspot/approval/request';

export type PublishServiceResult =
  | {
      status: 'published';
      hubspotQuoteId: string;
      shareableUrl: string | null;
      correlationId: string;
    }
  | { status: 'pending_approval'; approvalRequestId: string; correlationId: string }
  | { status: 'rejected'; approvalRequestId: string; correlationId: string }
  | { status: 'error'; error: 'MISSING_DEAL_LINK' | 'SCENARIO_NOT_FOUND'; message: string };

export interface PublishServiceOptions {
  scenarioId: string;
  /** Override the quote title sent to HubSpot. Defaults to "{customerName} — {scenarioName}". */
  quoteNameOverride?: string;
  /** Quote expiry in days (default 30). */
  expirationDays?: number;
  /** Correlation ID prefix — defaults to "publish". */
  correlationPrefix?: string;
}

/**
 * Build line items from the pricing engine, then call publishScenarioToHubSpot.
 * Shared by the MCP tools and the Next.js server actions.
 *
 * Phase 2c: if the engine reports hard-rail violations, this function branches
 * into the approval flow instead of throwing UnresolvedHardRailOverrideError:
 *   - APPROVED  → skip threshold check, proceed to publish
 *   - REJECTED  → return { status: 'rejected', approvalRequestId }
 *   - No request / PENDING → call submitApprovalRequest, return { status: 'pending_approval' }
 */
export async function runPublishScenario(
  opts: PublishServiceOptions,
): Promise<PublishServiceResult> {
  const {
    scenarioId,
    quoteNameOverride,
    expirationDays = 30,
    correlationPrefix = 'publish',
  } = opts;
  const correlationId = `${correlationPrefix}-${randomUUID()}`;

  let scenarioRow: Awaited<ReturnType<typeof computeScenario>>['scenarioRow'];
  let computeResult: Awaited<ReturnType<typeof computeScenario>>['computeResult'];
  try {
    ({ scenarioRow, computeResult } = await computeScenario(scenarioId));
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'NotFoundError'
    ) {
      return {
        status: 'error',
        error: 'SCENARIO_NOT_FOUND',
        message: `Scenario ${scenarioId} not found.`,
      };
    }
    throw err;
  }

  const scenario = scenarioRow;

  // Check for hard-rail overrides using the engine result
  const hasUnresolvedHardRailOverrides = computeResult.warnings.some((w) => w.severity === 'hard');

  // Determine the next revision number
  const quoteRepo = new HubSpotQuoteRepository(prisma);
  const latestQuote = await prisma.hubSpotQuote.findFirst({
    where: { scenarioId },
    orderBy: { revision: 'desc' },
  });
  const revision = (latestQuote?.revision ?? 0) + 1;

  // ---------------------------------------------------------------------------
  // Phase 2c: approval-flow branching on hard-rail overrides
  // ---------------------------------------------------------------------------
  if (hasUnresolvedHardRailOverrides) {
    const approvalRepo = new HubSpotApprovalRequestRepository(prisma);
    const existing = await approvalRepo.findByScenarioId(scenario.id);

    if (existing?.status === HubSpotApprovalStatus.REJECTED) {
      return {
        status: 'rejected',
        approvalRequestId: existing.id,
        correlationId,
      };
    }

    if (!scenario.hubspotDealId) {
      return {
        status: 'error',
        error: 'MISSING_DEAL_LINK',
        message: 'Scenario must be linked to a HubSpot Deal before publishing.',
      };
    }

    if (existing?.status !== HubSpotApprovalStatus.APPROVED) {
      // No request or still PENDING — submit (or re-submit) approval request.
      const approvalPersistence: ApprovalPersistence = {
        upsertApprovalRequest: async (d) =>
          approvalRepo.upsert(d as Parameters<typeof approvalRepo.upsert>[0]),
        findOrCreateQuoteRow: async ({ scenarioId: sid, revision: rev }) => {
          const existingRow = await quoteRepo.findByScenarioAndRevision(sid, rev);
          if (existingRow) return { id: existingRow.id };
          // Create a DRAFT placeholder row. The synthetic hubspotQuoteId is replaced
          // when publish resumes after approval. HubSpotQuote.hubspotQuoteId is @unique,
          // so we use a deterministic placeholder rather than leaving it null (which
          // would require a schema migration to make the column nullable).
          const created = await quoteRepo.create({
            scenarioId: sid,
            revision: rev,
            hubspotQuoteId: `pending-${sid}-${rev}`,
            publishState: HubSpotPublishState.DRAFT,
          });
          return { id: created.id };
        },
        updateQuotePublishState: async (id, state) => {
          await quoteRepo.updatePublishState(id, state);
        },
      };

      const marginPct = Number(computeResult.totals.marginPctNet ?? 0);
      const result = await submitApprovalRequest({
        scenarioId: scenario.id,
        hubspotDealId: scenario.hubspotDealId,
        revision,
        railViolations: computeResult.warnings
          .filter((w) => w.severity === 'hard')
          .map((w) => ({ ...w }) as Record<string, unknown>),
        marginPct,
        persistence: approvalPersistence,
        correlationId,
      });

      return {
        status: 'pending_approval',
        approvalRequestId: result.approvalRequestId,
        correlationId,
      };
    }

    // existing.status === APPROVED → fall through to normal publish path
    // (no threshold check — approval was granted)
  }

  // ---------------------------------------------------------------------------
  // Normal publish path (no hard overrides, or override is APPROVED)
  // ---------------------------------------------------------------------------

  // Build a map of productId → engine TabResult for SaaS tabs
  const saasTabResultByProductId = new Map(
    computeResult.perTab.filter((t) => t.kind === 'SAAS_USAGE').map((t) => [t.productId, t]),
  );

  // Load product details needed for HubSpot payload (name, sku, description)
  const saasProductIds = scenario.saasConfigs.map((c) => c.productId);
  const saasProductDetails =
    saasProductIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: saasProductIds } },
          select: {
            id: true,
            name: true,
            sku: true,
            description: true,
            listPrice: { select: { usdPerSeatPerMonth: true } },
          },
        })
      : [];
  const saasProductMap = new Map(saasProductDetails.map((p) => [p.id, p]));

  const saasLines = scenario.saasConfigs.map((cfg) => {
    const tabResult = saasTabResultByProductId.get(cfg.productId);
    const productDetail = saasProductMap.get(cfg.productId);
    const productName = productDetail?.name ?? cfg.productId;
    const productSku = productDetail?.sku ?? '';
    const productDescription = productDetail?.description ?? '';

    // METERED branch: emit a metered-shape line that the translator expands
    // into base + (optional) overage HubSpot line items.
    if (tabResult?.saasMeta?.metered) {
      const m = tabResult.saasMeta.metered;
      return {
        kind: 'METERED_SAAS' as const,
        productId: cfg.productId,
        productName,
        productSku,
        productDescription,
        contractMonths: scenario.contractMonths,
        unitLabel: m.unitLabel,
        includedUnitsPerMonth: m.includedUnitsPerMonth,
        committedMonthlyUsd: m.committedMonthlyUsd,
        contractDiscountPct: m.contractDiscountPct,
        overageUnits: m.overageUnits,
        overageRatePerUnitUsd: m.overageRatePerUnitUsd,
      };
    }

    const listPriceMonthly =
      productDetail?.listPrice?.usdPerSeatPerMonth != null
        ? new Decimal(productDetail.listPrice.usdPerSeatPerMonth.toString())
        : new Decimal(0);

    const seatCount = cfg.seatCount;
    let effectiveUnitPriceMonthly = new Decimal(0);
    if (tabResult && seatCount > 0) {
      effectiveUnitPriceMonthly = new Decimal(tabResult.monthlyRevenueCents)
        .div(100)
        .div(seatCount);
    } else if (tabResult && seatCount === 0) {
      effectiveUnitPriceMonthly = listPriceMonthly;
    }

    let discountPct: Decimal | null = null;
    if (tabResult?.saasMeta && !tabResult.saasMeta.effectiveDiscountPct.isZero()) {
      discountPct = tabResult.saasMeta.effectiveDiscountPct;
    } else if (listPriceMonthly.gt(0) && effectiveUnitPriceMonthly.lt(listPriceMonthly)) {
      discountPct = listPriceMonthly.minus(effectiveUnitPriceMonthly).div(listPriceMonthly);
    }

    return {
      kind: 'SAAS' as const,
      productId: cfg.productId,
      productName,
      productSku,
      productDescription,
      seatCount,
      listPriceMonthly,
      effectiveUnitPriceMonthly,
      discountPct,
      contractMonths: scenario.contractMonths,
      rampSchedule: null,
    };
  });

  const laborLines = scenario.laborLines.map((ll) => ({
    kind: 'LABOR' as const,
    skuId: ll.skuId ?? ll.productId,
    skuName: ll.customDescription ?? ll.productId,
    skuCode: ll.productId,
    skuDescription: '',
    qty: Number(ll.qty),
    unitPrice: new Decimal(ll.revenuePerUnitUsd.toString()),
  }));

  const lineItems = scenarioToHubSpotLineItems({
    scenarioId,
    tabs: [...saasLines, ...laborLines],
    bundles: [],
  });

  const persistence: PublishPersistence = {
    createHubSpotQuote: async (data) => quoteRepo.create(data),
    updatePublishState: async (rowId, state, extras) => {
      await quoteRepo.updatePublishState(rowId, state, extras);
    },
    findPriorRevision: async (sid, currentRevision) => {
      const prior = await quoteRepo.findLatestPublishedPrior(sid, currentRevision);
      return prior ? { id: prior.id, hubspotQuoteId: prior.hubspotQuoteId } : null;
    },
    markSuperseded: async (oldRowId, newRowId) => {
      await quoteRepo.markSuperseded(oldRowId, newRowId);
    },
  };

  const quoteName =
    quoteNameOverride ??
    (revision === 1
      ? `${scenario.customerName} — ${scenario.name}`
      : `${scenario.customerName} — ${scenario.name} v${revision}`);

  try {
    const outcome = await publishScenarioToHubSpot({
      scenario: {
        id: scenario.id,
        hubspotDealId: scenario.hubspotDealId,
        revision,
        hasUnresolvedHardRailOverrides: false, // approved or no overrides — skip threshold check
      },
      lineItems,
      quoteConfig: { name: quoteName, expirationDays },
      persistence,
      now: () => new Date(),
      correlationId,
    });
    return { status: 'published', ...outcome, correlationId };
  } catch (err) {
    if (err instanceof MissingDealLinkError) {
      return { status: 'error', error: 'MISSING_DEAL_LINK', message: err.message };
    }
    throw err;
  }
}
