import { hubspotFetch } from '../client';
import { hashSyncedFields } from './hash';
import { productToHubSpot, bundleToHubSpot } from './translator';
import type { CatalogSnapshot } from './snapshot';

export interface ExistingMapping {
  id?: string;
  pricerProductId: string | null;
  pricerBundleId: string | null;
  hubspotProductId: string;
  kind: 'PRODUCT' | 'BUNDLE';
  lastSyncedHash: string;
}

export interface PushOutcome {
  created: Array<{
    pricerId: string;
    kind: 'PRODUCT' | 'BUNDLE';
    hubspotProductId: string;
    hash: string;
  }>;
  updated: Array<{
    pricerId: string;
    kind: 'PRODUCT' | 'BUNDLE';
    hubspotProductId: string;
    hash: string;
  }>;
  unchanged: Array<{ pricerId: string; kind: 'PRODUCT' | 'BUNDLE'; hubspotProductId: string }>;
  failed: Array<{ pricerId: string; kind: 'PRODUCT' | 'BUNDLE'; error: string }>;
}

export interface PushInput {
  snapshot: CatalogSnapshot;
  existingMappings: ExistingMapping[];
  correlationId: string;
  now: () => Date;
}

export async function publishCatalogToHubSpot(input: PushInput): Promise<PushOutcome> {
  const outcome: PushOutcome = { created: [], updated: [], unchanged: [], failed: [] };

  const mapByProduct = new Map(
    input.existingMappings.filter((m) => m.pricerProductId).map((m) => [m.pricerProductId!, m]),
  );
  const mapByBundle = new Map(
    input.existingMappings.filter((m) => m.pricerBundleId).map((m) => [m.pricerBundleId!, m]),
  );

  for (const p of input.snapshot.products) {
    const { syncFields, payload } = productToHubSpot(p);
    const hash = hashSyncedFields(syncFields);
    const mapping = mapByProduct.get(p.id);

    try {
      if (!mapping) {
        const res = await hubspotFetch<{ id: string }>({
          method: 'POST',
          path: '/crm/v3/objects/products',
          body: { properties: { ...payload.properties, pricer_last_synced_hash: hash } },
          correlationId: input.correlationId,
        });
        outcome.created.push({ pricerId: p.id, kind: 'PRODUCT', hubspotProductId: res.id, hash });
      } else if (mapping.lastSyncedHash === hash) {
        outcome.unchanged.push({
          pricerId: p.id,
          kind: 'PRODUCT',
          hubspotProductId: mapping.hubspotProductId,
        });
      } else {
        await hubspotFetch({
          method: 'PATCH',
          path: `/crm/v3/objects/products/${mapping.hubspotProductId}`,
          body: { properties: { ...payload.properties, pricer_last_synced_hash: hash } },
          correlationId: input.correlationId,
        });
        outcome.updated.push({
          pricerId: p.id,
          kind: 'PRODUCT',
          hubspotProductId: mapping.hubspotProductId,
          hash,
        });
      }
    } catch (err) {
      outcome.failed.push({
        pricerId: p.id,
        kind: 'PRODUCT',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const b of input.snapshot.bundles) {
    const { syncFields, payload } = bundleToHubSpot(b);
    const hash = hashSyncedFields(syncFields);
    const mapping = mapByBundle.get(b.id);

    try {
      if (!mapping) {
        const res = await hubspotFetch<{ id: string }>({
          method: 'POST',
          path: '/crm/v3/objects/products',
          body: { properties: { ...payload.properties, pricer_last_synced_hash: hash } },
          correlationId: input.correlationId,
        });
        outcome.created.push({ pricerId: b.id, kind: 'BUNDLE', hubspotProductId: res.id, hash });
      } else if (mapping.lastSyncedHash === hash) {
        outcome.unchanged.push({
          pricerId: b.id,
          kind: 'BUNDLE',
          hubspotProductId: mapping.hubspotProductId,
        });
      } else {
        await hubspotFetch({
          method: 'PATCH',
          path: `/crm/v3/objects/products/${mapping.hubspotProductId}`,
          body: { properties: { ...payload.properties, pricer_last_synced_hash: hash } },
          correlationId: input.correlationId,
        });
        outcome.updated.push({
          pricerId: b.id,
          kind: 'BUNDLE',
          hubspotProductId: mapping.hubspotProductId,
          hash,
        });
      }
    } catch (err) {
      outcome.failed.push({
        pricerId: b.id,
        kind: 'BUNDLE',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return outcome;
}
