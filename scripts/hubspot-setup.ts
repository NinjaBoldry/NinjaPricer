#!/usr/bin/env tsx
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { provisionCustomProperties } from '../lib/hubspot/setup/provisionProperties';

async function main() {
  const correlationId = `setup-${randomUUID()}`;
  console.log(`[hubspot-setup] correlationId=${correlationId}`);

  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    console.error('HUBSPOT_ACCESS_TOKEN not set in environment');
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
