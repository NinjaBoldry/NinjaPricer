#!/usr/bin/env tsx
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { provisionCustomProperties } from '../lib/hubspot/setup/provisionProperties';

async function main() {
  const correlationId = `setup-${randomUUID()}`;
  console.log(`[hubspot-setup] correlationId=${correlationId}`);

  const hasOverride = !!process.env.HUBSPOT_ACCESS_TOKEN;
  const hasCreds = !!(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);
  if (!hasOverride && !hasCreds) {
    console.error(
      'HubSpot credentials not configured. Set HUBSPOT_CLIENT_ID + HUBSPOT_CLIENT_SECRET (preferred) or HUBSPOT_ACCESS_TOKEN.',
    );
    process.exit(1);
  }

  console.log('Provisioning custom properties...');
  const summary = await provisionCustomProperties({ correlationId });
  console.log(`  Created: ${summary.created.length}`);
  for (const c of summary.created) console.log(`    + ${c.objectType}.${c.name}`);
  console.log(`  Already present: ${summary.alreadyPresent.length}`);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
