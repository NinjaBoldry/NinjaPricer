import { describe, it } from 'vitest';

describe('POST /api/compute', () => {
  it.skip('returns 401 when unauthenticated', async () => {
    /* integration */
  });
  it.skip('returns 400 when scenarioId is missing from body', async () => {
    /* integration */
  });
  it.skip('returns 404 when scenario does not exist', async () => {
    /* integration */
  });
  it.skip("returns 403 when SALES user requests another owner's scenario", async () => {
    /* integration */
  });
  it.skip('returns 200 with ComputeResult for a valid scenario (ADMIN)', async () => {
    /* integration */
  });
  it.skip("returns 200 with ComputeResult for a SALES user's own scenario", async () => {
    /* integration */
  });
  it.skip('returns 422 when engine validation fails (e.g. unknown productId in config)', async () => {
    /* integration */
  });
});
