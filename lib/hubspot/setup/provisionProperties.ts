import { hubspotFetch, HubSpotApiError } from '../client';

export interface PropertyDefinition {
  objectType: 'products' | 'line_items' | 'deals' | 'quotes';
  name: string;
  label: string;
  type: 'string' | 'number' | 'enumeration' | 'bool';
  fieldType: 'text' | 'number' | 'select' | 'booleancheckbox';
  options?: Array<{ label: string; value: string }>;
  groupName: string;
}

export const REQUIRED_PROPERTIES: PropertyDefinition[] = [
  // Products
  {
    objectType: 'products',
    name: 'pricer_managed',
    label: 'Pricer Managed',
    type: 'bool',
    fieldType: 'booleancheckbox',
    groupName: 'productinformation',
  },
  {
    objectType: 'products',
    name: 'pricer_product_id',
    label: 'Pricer Product ID',
    type: 'string',
    fieldType: 'text',
    groupName: 'productinformation',
  },
  {
    objectType: 'products',
    name: 'pricer_kind',
    label: 'Pricer Kind',
    type: 'enumeration',
    fieldType: 'select',
    groupName: 'productinformation',
    options: [
      { label: 'Product', value: 'product' },
      { label: 'Bundle', value: 'bundle' },
    ],
  },
  {
    objectType: 'products',
    name: 'pricer_last_synced_hash',
    label: 'Pricer Last Synced Hash',
    type: 'string',
    fieldType: 'text',
    groupName: 'productinformation',
  },
  // Phase 6: METERED-product fields. Set on Products whose Ninja Pricer
  // revenueModel = METERED so HubSpot views can surface usage terms.
  {
    objectType: 'products',
    name: 'np_metered_unit_label',
    label: 'NP Metered Unit Label',
    type: 'string',
    fieldType: 'text',
    groupName: 'productinformation',
  },
  {
    objectType: 'products',
    name: 'np_included_units',
    label: 'NP Included Units / Month',
    type: 'number',
    fieldType: 'number',
    groupName: 'productinformation',
  },
  {
    objectType: 'products',
    name: 'np_overage_rate',
    label: 'NP Overage Rate (USD / unit)',
    type: 'number',
    fieldType: 'number',
    groupName: 'productinformation',
  },
  // Line items (used by later phases, created now so a single setup run covers everything)
  {
    objectType: 'line_items',
    name: 'pricer_reason',
    label: 'Pricer Reason',
    type: 'enumeration',
    fieldType: 'select',
    groupName: 'lineiteminformation',
    options: [
      { label: 'Bundle Rollup', value: 'bundle_rollup' },
      { label: 'Negotiated', value: 'negotiated' },
      { label: 'Ramp', value: 'ramp' },
      { label: 'Other', value: 'other' },
    ],
  },
  {
    objectType: 'line_items',
    name: 'pricer_original_list_price',
    label: 'Pricer Original List Price',
    type: 'number',
    fieldType: 'number',
    groupName: 'lineiteminformation',
  },
  {
    objectType: 'line_items',
    name: 'pricer_scenario_id',
    label: 'Pricer Scenario ID',
    type: 'string',
    fieldType: 'text',
    groupName: 'lineiteminformation',
  },
  {
    objectType: 'line_items',
    name: 'pricer_ramp_schedule',
    label: 'Pricer Ramp Schedule (JSON)',
    type: 'string',
    fieldType: 'text',
    groupName: 'lineiteminformation',
  },
  // Deals
  {
    objectType: 'deals',
    name: 'pricer_scenario_id',
    label: 'Pricer Scenario ID',
    type: 'string',
    fieldType: 'text',
    groupName: 'dealinformation',
  },
  {
    objectType: 'deals',
    name: 'pricer_approval_status',
    label: 'Pricer Approval Status',
    type: 'enumeration',
    fieldType: 'select',
    groupName: 'dealinformation',
    options: [
      { label: 'Not Required', value: 'not_required' },
      { label: 'Pending', value: 'pending' },
      { label: 'Approved', value: 'approved' },
      { label: 'Rejected', value: 'rejected' },
    ],
  },
  {
    objectType: 'deals',
    name: 'pricer_margin_pct',
    label: 'Pricer Margin %',
    type: 'number',
    fieldType: 'number',
    groupName: 'dealinformation',
  },
  // Quotes
  {
    objectType: 'quotes',
    name: 'pricer_scenario_id',
    label: 'Pricer Scenario ID',
    type: 'string',
    fieldType: 'text',
    groupName: 'quoteinformation',
  },
  {
    objectType: 'quotes',
    name: 'pricer_revision',
    label: 'Pricer Revision',
    type: 'number',
    fieldType: 'number',
    groupName: 'quoteinformation',
  },
  {
    objectType: 'quotes',
    name: 'pricer_supersedes',
    label: 'Pricer Supersedes Quote ID',
    type: 'string',
    fieldType: 'text',
    groupName: 'quoteinformation',
  },
];

export interface ProvisionSummary {
  created: Array<{ objectType: string; name: string }>;
  alreadyPresent: Array<{ objectType: string; name: string }>;
}

export async function provisionCustomProperties(opts: {
  correlationId: string;
}): Promise<ProvisionSummary> {
  const summary: ProvisionSummary = { created: [], alreadyPresent: [] };

  for (const def of REQUIRED_PROPERTIES) {
    try {
      await hubspotFetch({
        method: 'GET',
        path: `/crm/v3/properties/${def.objectType}/${def.name}`,
        correlationId: opts.correlationId,
      });
      summary.alreadyPresent.push({ objectType: def.objectType, name: def.name });
    } catch (err) {
      if (err instanceof HubSpotApiError && err.status === 404) {
        const options =
          def.type === 'bool'
            ? [
                { label: 'True', value: 'true', displayOrder: 0, hidden: false },
                { label: 'False', value: 'false', displayOrder: 1, hidden: false },
              ]
            : def.options;
        await hubspotFetch({
          method: 'POST',
          path: `/crm/v3/properties/${def.objectType}`,
          body: {
            name: def.name,
            label: def.label,
            type: def.type,
            fieldType: def.fieldType,
            groupName: def.groupName,
            options,
          },
          correlationId: opts.correlationId,
        });
        summary.created.push({ objectType: def.objectType, name: def.name });
      } else {
        throw err;
      }
    }
  }

  return summary;
}
