import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeQuotePdf, quotePdfPath } from './quoteStorage';

describe('quoteStorage', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'quote-storage-'));
    process.env.QUOTE_STORAGE_DIR = tmp;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes a pdf to scenarioId/quoteId-customer.pdf', async () => {
    const buf = Buffer.from('%PDF-1.4 test', 'utf8');
    const dest = await writeQuotePdf({
      scenarioId: 'scen_123',
      quoteId: 'quote_abc',
      kind: 'customer',
      buffer: buf,
    });

    const expected = path.join(tmp, 'scen_123', 'quote_abc-customer.pdf');
    expect(dest).toBe(expected);
    expect(existsSync(expected)).toBe(true);
    expect(readFileSync(expected)).toEqual(buf);
  });

  it('quotePdfPath resolves without writing', () => {
    const p = quotePdfPath({ scenarioId: 's', quoteId: 'q', kind: 'internal' });
    expect(p).toBe(path.join(tmp, 's', 'q-internal.pdf'));
  });

  it('throws if QUOTE_STORAGE_DIR is unset', async () => {
    delete process.env.QUOTE_STORAGE_DIR;
    await expect(
      writeQuotePdf({ scenarioId: 's', quoteId: 'q', kind: 'customer', buffer: Buffer.from('') }),
    ).rejects.toThrow(/QUOTE_STORAGE_DIR/);
  });
});
