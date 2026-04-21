import { mkdir, writeFile } from 'node:fs/promises';
import { createReadStream, type ReadStream } from 'node:fs';
import path from 'node:path';

export type QuoteKind = 'customer' | 'internal';

interface StorageArgs {
  scenarioId: string;
  quoteId: string;
  kind: QuoteKind;
}

function baseDir(): string {
  const dir = process.env.QUOTE_STORAGE_DIR;
  if (!dir) {
    throw new Error('QUOTE_STORAGE_DIR is not configured');
  }
  return dir;
}

export function quotePdfPath({ scenarioId, quoteId, kind }: StorageArgs): string {
  return path.join(baseDir(), scenarioId, `${quoteId}-${kind}.pdf`);
}

export async function writeQuotePdf(args: StorageArgs & { buffer: Buffer }): Promise<string> {
  const dest = quotePdfPath(args);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, args.buffer);
  return dest;
}

export function readQuotePdfStream(args: StorageArgs): ReadStream {
  return createReadStream(quotePdfPath(args));
}
