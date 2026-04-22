import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { hubspotFetch } from '@/lib/hubspot/client';
import {
  publishScenarioToHubSpot,
  MissingDealLinkError,
  UnresolvedHardRailOverrideError,
  type PublishPersistence,
} from '@/lib/hubspot/quote/publish';
import { scenarioToHubSpotLineItems } from '@/lib/hubspot/quote/translator';
import { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';
import { computeScenario } from '@/lib/services/rateSnapshot';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface HubSpotMatch {
  id: string;
  type: 'contact' | 'company';
  properties: Record<string, string | null>;
}

// ---------------------------------------------------------------------------
// create_hubspot_deal_for_scenario
// ---------------------------------------------------------------------------

const createDealInput = z
  .object({
    scenarioId: z.string().min(1),
    dealName: z.string().min(1),
    contactEmail: z.string().email().optional(),
    companyDomain: z.string().optional(),
    forceCreate: z.boolean().default(false),
  })
  .strict();

type CreateDealInput = z.infer<typeof createDealInput>;

interface CreateDealResult {
  created: boolean;
  matches?: HubSpotMatch[] | undefined;
  dealId?: string | undefined;
  contactId?: string | undefined;
  companyId?: string | undefined;
}

export const createHubspotDealForScenarioTool: ToolDefinition<
  CreateDealInput,
  CreateDealResult
> = {
  name: 'create_hubspot_deal_for_scenario',
  description:
    'Create a new HubSpot Deal for a scenario. Searches by contact email and company domain first — if matches are found and forceCreate is false, returns matches without creating. Otherwise creates Deal + Contact + Company and links to the scenario.',
  inputSchema: createDealInput as z.ZodType<CreateDealInput>,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (_ctx, input) => {
    const correlationId = `create-deal-${randomUUID()}`;
    const matches: HubSpotMatch[] = [];

    // Search by contact email
    if (input.contactEmail) {
      const contactSearch = await hubspotFetch<{ results: Array<{ id: string; properties: Record<string, string | null> }>; total: number }>({
        method: 'POST',
        path: '/crm/v3/objects/contacts/search',
        body: {
          filterGroups: [
            {
              filters: [{ propertyName: 'email', operator: 'EQ', value: input.contactEmail }],
            },
          ],
          properties: ['email', 'firstname', 'lastname'],
        },
        correlationId,
      });
      for (const r of contactSearch.results) {
        matches.push({ id: r.id, type: 'contact', properties: r.properties });
      }
    }

    // Search by company domain
    if (input.companyDomain) {
      const companySearch = await hubspotFetch<{ results: Array<{ id: string; properties: Record<string, string | null> }>; total: number }>({
        method: 'POST',
        path: '/crm/v3/objects/companies/search',
        body: {
          filterGroups: [
            {
              filters: [{ propertyName: 'domain', operator: 'EQ', value: input.companyDomain }],
            },
          ],
          properties: ['name', 'domain'],
        },
        correlationId,
      });
      for (const r of companySearch.results) {
        matches.push({ id: r.id, type: 'company', properties: r.properties });
      }
    }

    // If matches found and not forcing create, return them
    if (matches.length > 0 && !input.forceCreate) {
      return { created: false, matches };
    }

    // Create Deal
    const dealRes = await hubspotFetch<{ id: string }>({
      method: 'POST',
      path: '/crm/v3/objects/deals',
      body: {
        properties: {
          dealname: input.dealName,
          pricer_scenario_id: input.scenarioId,
        },
      },
      correlationId,
    });

    let contactId: string | undefined;
    let companyId: string | undefined;

    // Create or use existing contact
    const existingContact = matches.find((m) => m.type === 'contact');
    if (existingContact) {
      contactId = existingContact.id;
    } else if (input.contactEmail) {
      const contactRes = await hubspotFetch<{ id: string }>({
        method: 'POST',
        path: '/crm/v3/objects/contacts',
        body: {
          properties: { email: input.contactEmail },
        },
        correlationId,
      });
      contactId = contactRes.id;
    }

    // Create or use existing company
    const existingCompany = matches.find((m) => m.type === 'company');
    if (existingCompany) {
      companyId = existingCompany.id;
    } else if (input.companyDomain) {
      const companyRes = await hubspotFetch<{ id: string }>({
        method: 'POST',
        path: '/crm/v3/objects/companies',
        body: {
          properties: { domain: input.companyDomain },
        },
        correlationId,
      });
      companyId = companyRes.id;
    }

    // Associate Deal → Contact (type ID 3)
    if (contactId) {
      await hubspotFetch({
        method: 'PUT',
        path: `/crm/v3/objects/deals/${dealRes.id}/associations/contacts/${contactId}`,
        body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
        correlationId,
      });
    }

    // Associate Deal → Company (type ID 5)
    if (companyId) {
      await hubspotFetch({
        method: 'PUT',
        path: `/crm/v3/objects/deals/${dealRes.id}/associations/companies/${companyId}`,
        body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }],
        correlationId,
      });
    }

    // Link scenario to the new deal
    await prisma.scenario.update({
      where: { id: input.scenarioId },
      data: {
        hubspotDealId: dealRes.id,
        ...(contactId && { hubspotPrimaryContactId: contactId }),
        ...(companyId && { hubspotCompanyId: companyId }),
      },
    });

    return { created: true, dealId: dealRes.id, contactId, companyId };
  },
};

// ---------------------------------------------------------------------------
// publish_scenario_to_hubspot
// ---------------------------------------------------------------------------

const publishInput = z
  .object({
    scenarioId: z.string().min(1),
    quoteNameOverride: z.string().optional(),
    expirationDays: z.number().int().min(1).default(30),
  })
  .strict();

type PublishInput = z.infer<typeof publishInput>;

interface PublishResult {
  hubspotQuoteId: string;
  shareableUrl: string | null;
  correlationId: string;
}

interface PublishErrorResult {
  error: 'MISSING_DEAL_LINK' | 'UNRESOLVED_HARD_RAIL_OVERRIDE' | 'SCENARIO_NOT_FOUND';
  message: string;
}

export const publishScenarioToHubspotTool: ToolDefinition<
  PublishInput,
  PublishResult | PublishErrorResult
> = {
  name: 'publish_scenario_to_hubspot',
  description:
    'Publish a pricer scenario as a HubSpot Quote on the linked Deal. Builds line items from the scenario state. Catches MissingDealLinkError and UnresolvedHardRailOverrideError and returns structured errors.',
  inputSchema: publishInput as z.ZodType<PublishInput>,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (_ctx, input) => {
    const correlationId = `publish-${randomUUID()}`;

    // Run the pricing engine to get real per-seat prices
    let scenarioRow: Awaited<ReturnType<typeof computeScenario>>['scenarioRow'];
    let computeResult: Awaited<ReturnType<typeof computeScenario>>['computeResult'];
    try {
      ({ scenarioRow, computeResult } = await computeScenario(input.scenarioId));
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'NotFoundError') {
        return { error: 'SCENARIO_NOT_FOUND', message: `Scenario ${input.scenarioId} not found.` };
      }
      throw err;
    }

    const scenario = scenarioRow;

    // Determine the next revision number
    const latestQuote = await prisma.hubSpotQuote.findFirst({
      where: { scenarioId: input.scenarioId },
      orderBy: { revision: 'desc' },
    });
    const revision = (latestQuote?.revision ?? 0) + 1;

    // Build a map of productId → engine TabResult for SaaS tabs
    const saasTabResultByProductId = new Map(
      computeResult.perTab
        .filter((t) => t.kind === 'SAAS_USAGE')
        .map((t) => [t.productId, t]),
    );

    // Build SaaS lines using engine-computed prices
    // Load product details needed for HubSpot payload (name, sku, description)
    const saasProductIds = scenario.saasConfigs.map((c) => c.productId);
    const saasProductDetails = saasProductIds.length > 0
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

      // List price per seat from the product snapshot
      const listPriceMonthly = productDetail?.listPrice?.usdPerSeatPerMonth != null
        ? new Decimal(productDetail.listPrice.usdPerSeatPerMonth.toString())
        : new Decimal(0);

      // Effective unit price = engine monthlyRevenueCents / 100 / seatCount
      const seatCount = cfg.seatCount;
      let effectiveUnitPriceMonthly = new Decimal(0);
      if (tabResult && seatCount > 0) {
        effectiveUnitPriceMonthly = new Decimal(tabResult.monthlyRevenueCents).div(100).div(seatCount);
      } else if (tabResult && seatCount === 0) {
        effectiveUnitPriceMonthly = listPriceMonthly;
      }

      // Discount pct derived from list vs effective (or from saasMeta if available)
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
      scenarioId: input.scenarioId,
      tabs: [...saasLines, ...laborLines],
      bundles: [],
    });

    // Build PublishPersistence from HubSpotQuoteRepository
    const quoteRepo = new HubSpotQuoteRepository(prisma);

    const persistence: PublishPersistence = {
      createHubSpotQuote: async (data) => quoteRepo.create(data),
      updatePublishState: async (rowId, state, extras) => {
        await quoteRepo.updatePublishState(rowId, state, extras);
      },
      findPriorRevision: async (scenarioId, currentRevision) => {
        const prior = await quoteRepo.findByScenarioAndRevision(scenarioId, currentRevision - 1);
        return prior ? { id: prior.id, hubspotQuoteId: prior.hubspotQuoteId } : null;
      },
      markSuperseded: async (oldRowId, newRowId) => {
        await quoteRepo.markSuperseded(oldRowId, newRowId);
      },
    };

    try {
      const outcome = await publishScenarioToHubSpot({
        scenario: {
          id: scenario.id,
          hubspotDealId: scenario.hubspotDealId,
          revision,
          hasUnresolvedHardRailOverrides: false,
        },
        lineItems,
        quoteConfig: {
          name: input.quoteNameOverride ?? `${scenario.customerName} — ${scenario.name}`,
          expirationDays: input.expirationDays,
        },
        persistence,
        now: () => new Date(),
        correlationId,
      });

      return { ...outcome, correlationId };
    } catch (err) {
      if (err instanceof MissingDealLinkError) {
        return { error: 'MISSING_DEAL_LINK', message: err.message };
      }
      if (err instanceof UnresolvedHardRailOverrideError) {
        return { error: 'UNRESOLVED_HARD_RAIL_OVERRIDE', message: err.message };
      }
      throw err;
    }
  },
};

// ---------------------------------------------------------------------------
// check_publish_status
// ---------------------------------------------------------------------------

const checkStatusInput = z.object({ scenarioId: z.string().min(1) }).strict();

type CheckStatusInput = z.infer<typeof checkStatusInput>;

interface CheckStatusResult {
  publishState: string | null;
  hubspotQuoteId: string | null;
  shareableUrl: string | null;
  lastStatus: string | null;
  dealOutcome: string | null;
  revision: number | null;
}

export const checkPublishStatusTool: ToolDefinition<CheckStatusInput, CheckStatusResult> = {
  name: 'check_publish_status',
  description:
    'Return the latest HubSpot quote publish status for a scenario: publishState, hubspotQuoteId, shareableUrl, lastStatus, dealOutcome, revision. Returns null fields when no quote has been published yet.',
  inputSchema: checkStatusInput,
  requiresAdmin: false,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (_ctx, input) => {
    const latest = await prisma.hubSpotQuote.findFirst({
      where: { scenarioId: input.scenarioId },
      orderBy: { revision: 'desc' },
    });

    if (!latest) {
      return {
        publishState: null,
        hubspotQuoteId: null,
        shareableUrl: null,
        lastStatus: null,
        dealOutcome: null,
        revision: null,
      };
    }

    return {
      publishState: latest.publishState,
      hubspotQuoteId: latest.hubspotQuoteId,
      shareableUrl: latest.shareableUrl ?? null,
      lastStatus: latest.lastStatus ?? null,
      dealOutcome: latest.dealOutcome ?? null,
      revision: latest.revision,
    };
  },
};

// ---------------------------------------------------------------------------
// supersede_hubspot_quote
// ---------------------------------------------------------------------------

const supersedeInput = z
  .object({
    scenarioId: z.string().min(1),
    quoteNameOverride: z.string().optional(),
    expirationDays: z.number().int().min(1).default(30),
  })
  .strict();

type SupersedeInput = z.infer<typeof supersedeInput>;

export const supersedeHubspotQuoteTool: ToolDefinition<
  SupersedeInput,
  PublishResult | PublishErrorResult
> = {
  name: 'supersede_hubspot_quote',
  description:
    'Publish a new revision of the HubSpot Quote for a scenario, superseding the prior revision. Reads the latest revision number and increments by 1. Output is the same shape as publish_scenario_to_hubspot.',
  inputSchema: supersedeInput as z.ZodType<SupersedeInput>,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (_ctx, input) => {
    const correlationId = `supersede-${randomUUID()}`;

    // Run the pricing engine to get real per-seat prices
    let scenarioRow: Awaited<ReturnType<typeof computeScenario>>['scenarioRow'];
    let computeResult: Awaited<ReturnType<typeof computeScenario>>['computeResult'];
    try {
      ({ scenarioRow, computeResult } = await computeScenario(input.scenarioId));
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'NotFoundError') {
        return { error: 'SCENARIO_NOT_FOUND' as const, message: `Scenario ${input.scenarioId} not found.` };
      }
      throw err;
    }

    const scenario = scenarioRow;

    // Get the current latest revision and increment
    const latestQuote = await prisma.hubSpotQuote.findFirst({
      where: { scenarioId: input.scenarioId },
      orderBy: { revision: 'desc' },
    });
    const revision = (latestQuote?.revision ?? 0) + 1;

    // Build a map of productId → engine TabResult for SaaS tabs
    const saasTabResultByProductId = new Map(
      computeResult.perTab
        .filter((t) => t.kind === 'SAAS_USAGE')
        .map((t) => [t.productId, t]),
    );

    // Load product details needed for HubSpot payload (name, sku, description)
    const saasProductIds = scenario.saasConfigs.map((c) => c.productId);
    const saasProductDetails = saasProductIds.length > 0
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

    // Build SaaS lines using engine-computed prices
    const saasLines = scenario.saasConfigs.map((cfg) => {
      const tabResult = saasTabResultByProductId.get(cfg.productId);
      const productDetail = saasProductMap.get(cfg.productId);
      const productName = productDetail?.name ?? cfg.productId;
      const productSku = productDetail?.sku ?? '';
      const productDescription = productDetail?.description ?? '';

      const listPriceMonthly = productDetail?.listPrice?.usdPerSeatPerMonth != null
        ? new Decimal(productDetail.listPrice.usdPerSeatPerMonth.toString())
        : new Decimal(0);

      const seatCount = cfg.seatCount;
      let effectiveUnitPriceMonthly = new Decimal(0);
      if (tabResult && seatCount > 0) {
        effectiveUnitPriceMonthly = new Decimal(tabResult.monthlyRevenueCents).div(100).div(seatCount);
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
      scenarioId: input.scenarioId,
      tabs: [...saasLines, ...laborLines],
      bundles: [],
    });

    // Build PublishPersistence from HubSpotQuoteRepository
    const quoteRepo = new HubSpotQuoteRepository(prisma);

    const persistence: PublishPersistence = {
      createHubSpotQuote: async (data) => quoteRepo.create(data),
      updatePublishState: async (rowId, state, extras) => {
        await quoteRepo.updatePublishState(rowId, state, extras);
      },
      findPriorRevision: async (scenarioId, currentRevision) => {
        const prior = await quoteRepo.findByScenarioAndRevision(scenarioId, currentRevision - 1);
        return prior ? { id: prior.id, hubspotQuoteId: prior.hubspotQuoteId } : null;
      },
      markSuperseded: async (oldRowId, newRowId) => {
        await quoteRepo.markSuperseded(oldRowId, newRowId);
      },
    };

    try {
      const outcome = await publishScenarioToHubSpot({
        scenario: {
          id: scenario.id,
          hubspotDealId: scenario.hubspotDealId,
          revision,
          hasUnresolvedHardRailOverrides: false,
        },
        lineItems,
        quoteConfig: {
          name: input.quoteNameOverride ?? `${scenario.customerName} — ${scenario.name} v${revision}`,
          expirationDays: input.expirationDays,
        },
        persistence,
        now: () => new Date(),
        correlationId,
      });

      return { ...outcome, correlationId };
    } catch (err) {
      if (err instanceof MissingDealLinkError) {
        return { error: 'MISSING_DEAL_LINK' as const, message: err.message };
      }
      if (err instanceof UnresolvedHardRailOverrideError) {
        return { error: 'UNRESOLVED_HARD_RAIL_OVERRIDE' as const, message: err.message };
      }
      throw err;
    }
  },
};

// ---------------------------------------------------------------------------
// link_scenario_to_hubspot_deal
// ---------------------------------------------------------------------------

const linkInput = z.object({ scenarioId: z.string().min(1), hubspotDealId: z.string().min(1) }).strict();

export const linkScenarioToHubspotDealTool: ToolDefinition<
  z.infer<typeof linkInput>,
  { ok: true }
> = {
  name: 'link_scenario_to_hubspot_deal',
  description:
    'Link a pricer scenario to an existing HubSpot Deal. Validates the deal exists before writing. Returns { ok: true }.',
  inputSchema: linkInput,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (_ctx, input) => {
    // Validate deal exists
    await hubspotFetch({
      method: 'GET',
      path: `/crm/v3/objects/deals/${input.hubspotDealId}`,
      correlationId: `link-${randomUUID()}`,
    });
    await prisma.scenario.update({
      where: { id: input.scenarioId },
      data: { hubspotDealId: input.hubspotDealId },
    });
    return { ok: true };
  },
};
