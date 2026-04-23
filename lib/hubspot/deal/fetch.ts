import { hubspotFetch } from '../client';

export interface DealSnapshot {
  dealName: string | null;
  dealStage: string | null; // human label, e.g. "Discovery"
  dealStageId: string | null; // internal id, e.g. "appointmentscheduled"
  companyId: string | null;
  companyName: string | null;
  primaryContactId: string | null;
}

interface DealResponse {
  id: string;
  properties: { dealname?: string; dealstage?: string; pipeline?: string };
  associations?: {
    companies?: { results?: Array<{ id: string }> };
    contacts?: { results?: Array<{ id: string }> };
  };
}

interface PipelinesResponse {
  results?: Array<{
    id: string;
    stages?: Array<{ id: string; label: string }>;
  }>;
}

interface CompanyResponse {
  properties: { name?: string };
}

export async function fetchDealSnapshot(
  dealId: string,
  correlationId: string,
): Promise<DealSnapshot> {
  const deal = await hubspotFetch<DealResponse>({
    method: 'GET',
    path: `/crm/v3/objects/deals/${dealId}`,
    query: {
      properties: 'dealname,dealstage,pipeline',
      associations: 'companies,contacts',
    },
    correlationId,
  });

  const dealStageId = deal.properties.dealstage ?? null;
  const pipelineId = deal.properties.pipeline ?? 'default';

  // Resolve stage label via pipelines API (best-effort — fall back to raw id)
  let dealStageLabel: string | null = dealStageId;
  try {
    const pipelines = await hubspotFetch<PipelinesResponse>({
      method: 'GET',
      path: `/crm/v3/pipelines/deals`,
      correlationId,
    });
    const pipeline = pipelines.results?.find((p) => p.id === pipelineId);
    const stage = pipeline?.stages?.find((s) => s.id === dealStageId);
    if (stage) dealStageLabel = stage.label;
  } catch {
    // leave as id — best-effort
  }

  const companyId = deal.associations?.companies?.results?.[0]?.id ?? null;
  const primaryContactId = deal.associations?.contacts?.results?.[0]?.id ?? null;

  let companyName: string | null = null;
  if (companyId) {
    try {
      const company = await hubspotFetch<CompanyResponse>({
        method: 'GET',
        path: `/crm/v3/objects/companies/${companyId}`,
        query: { properties: 'name' },
        correlationId,
      });
      companyName = company.properties.name ?? null;
    } catch {
      // best-effort
    }
  }

  return {
    dealName: deal.properties.dealname ?? null,
    dealStage: dealStageLabel,
    dealStageId,
    companyId,
    companyName,
    primaryContactId,
  };
}
