/** Shared URL helpers for the HubSpot App Card routes. */

const DEFAULT_PRICER_URL = 'https://ninjapricer-production.up.railway.app';

export function getPricerAppUrl(): string {
  return process.env.PRICER_APP_URL ?? DEFAULT_PRICER_URL;
}

export function buildScenarioHubspotUrl(scenarioId: string): string {
  return `${getPricerAppUrl()}/scenarios/${scenarioId}/hubspot`;
}
