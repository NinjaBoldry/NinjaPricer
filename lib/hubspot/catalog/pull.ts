import { hubspotFetch } from '../client';
import { hashSyncedFields } from './hash';
import type { CatalogSnapshot } from './snapshot';
import { productToHubSpot, bundleToHubSpot } from './translator';
import type { ExistingMapping } from './push';

export interface ReviewItemInput {
  entityType: 'PRODUCT' | 'BUNDLE';
  hubspotId: string;
  pricerEntityId: string;
  changedFields: Record<string, { pricer: unknown; hubspot: unknown }>;
  changedFieldsHash: string;
}

export interface PullOutcome {
  reviewItems: ReviewItemInput[];
  orphansInHubSpot: Array<{ hubspotId: string; pricerEntityId: string }>;
}

export async function pullHubSpotChanges(input: {
  existingMappings: ExistingMapping[];
  pricerSnapshot: CatalogSnapshot;
  correlationId: string;
}): Promise<PullOutcome> {
  // Query HubSpot for pricer-managed products
  const properties =
    'name,hs_sku,description,price,recurringbillingfrequency,pricer_managed,pricer_product_id,pricer_kind,pricer_last_synced_hash';
  const res = await hubspotFetch<{
    results: Array<{ id: string; properties: Record<string, string> }>;
  }>({
    method: 'POST',
    path: '/crm/v3/objects/products/search',
    body: {
      filterGroups: [
        { filters: [{ propertyName: 'pricer_managed', operator: 'EQ', value: 'true' }] },
      ],
      properties: properties.split(','),
      limit: 100,
    },
    correlationId: input.correlationId,
  });

  const mapByHubspotId = new Map(input.existingMappings.map((m) => [m.hubspotProductId, m]));
  const pricerProductById = new Map(input.pricerSnapshot.products.map((p) => [p.id, p]));
  const pricerBundleById = new Map(input.pricerSnapshot.bundles.map((b) => [b.id, b]));

  const reviewItems: ReviewItemInput[] = [];
  const orphans: PullOutcome['orphansInHubSpot'] = [];

  for (const row of res.results) {
    const mapping = mapByHubspotId.get(row.id);
    const pricerId = row.properties.pricer_product_id;
    const kind = row.properties.pricer_kind === 'bundle' ? 'BUNDLE' : 'PRODUCT';

    if (!mapping || !pricerId) {
      orphans.push({ hubspotId: row.id, pricerEntityId: pricerId ?? '' });
      continue;
    }

    // Compute pricer-side hash from snapshot
    let pricerHash: string;
    let pricerSyncFieldsObj: Record<string, unknown>;
    if (kind === 'PRODUCT') {
      const p = pricerProductById.get(pricerId);
      if (!p) {
        orphans.push({ hubspotId: row.id, pricerEntityId: pricerId });
        continue;
      }
      const { syncFields } = productToHubSpot(p);
      pricerHash = hashSyncedFields(syncFields);
      pricerSyncFieldsObj = syncFields as unknown as Record<string, unknown>;
    } else {
      const b = pricerBundleById.get(pricerId);
      if (!b) {
        orphans.push({ hubspotId: row.id, pricerEntityId: pricerId });
        continue;
      }
      const { syncFields } = bundleToHubSpot(b);
      pricerHash = hashSyncedFields(syncFields);
      pricerSyncFieldsObj = syncFields as unknown as Record<string, unknown>;
    }

    const hubspotSyncFields = buildHubSpotSyncFieldsFromRow(row);
    const hubspotHash = hashSyncedFields(hubspotSyncFields);

    // Plan's three-way logic:
    if (hubspotHash === mapping.lastSyncedHash) {
      continue; // HubSpot didn't change since last sync
    }
    if (pricerHash !== mapping.lastSyncedHash) {
      continue; // Both sides changed — pricer push will overwrite HubSpot, not a review concern
    }
    // Only reach here when pricer is unchanged but HubSpot changed → genuine review item.
    const changedFields = diffFields(
      pricerSyncFieldsObj,
      hubspotSyncFields as unknown as Record<string, unknown>,
    );
    reviewItems.push({
      entityType: kind,
      hubspotId: row.id,
      pricerEntityId: pricerId,
      changedFields,
      changedFieldsHash: hubspotHash,
    });
  }

  return { reviewItems, orphansInHubSpot: orphans };
}

function buildHubSpotSyncFieldsFromRow(row: {
  properties: Record<string, string>;
}): Parameters<typeof hashSyncedFields>[0] {
  const common = {
    name: row.properties.name ?? '',
    sku: row.properties.hs_sku ?? '',
    description: row.properties.description ?? '',
    unitPrice: row.properties.price ?? '0',
    recurringBillingFrequency: row.properties.recurringbillingfrequency ?? 'monthly',
  };
  if (row.properties.pricer_kind === 'bundle') {
    return { kind: 'BUNDLE', ...common, itemIdentifiers: [] }; // bundle-item membership is not in HubSpot side
  }
  return { kind: 'PRODUCT', ...common };
}

function diffFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, { pricer: unknown; hubspot: unknown }> {
  const diff: Record<string, { pricer: unknown; hubspot: unknown }> = {};
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  for (const k of keys) {
    if (k === 'kind' || k === 'itemIdentifiers') continue;
    if (a[k] !== b[k]) diff[k] = { pricer: a[k], hubspot: b[k] };
  }
  return diff;
}
