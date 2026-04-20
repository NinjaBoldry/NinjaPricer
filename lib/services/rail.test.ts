import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { RailService } from './rail';
import { ValidationError } from '../utils/errors';
import { mockRailRepo } from '../db/repositories/__mocks__/rail';

const validMinMarginInput = {
  productId: 'p1',
  kind: 'MIN_MARGIN_PCT' as const,
  marginBasis: 'CONTRIBUTION' as const,
  softThreshold: new Decimal('0.10'),
  hardThreshold: new Decimal('0.15'),
  isEnabled: true,
};

describe('RailService.upsert', () => {
  it('accepts valid MIN_MARGIN_PCT input', async () => {
    const repo = mockRailRepo();
    const service = new RailService(repo);
    await expect(service.upsert(validMinMarginInput)).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when MIN_MARGIN_PCT soft > hard (wrong direction)', async () => {
    const service = new RailService(mockRailRepo());
    await expect(
      service.upsert({
        ...validMinMarginInput,
        softThreshold: new Decimal('0.20'),
        hardThreshold: new Decimal('0.10'),
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        ...validMinMarginInput,
        softThreshold: new Decimal('0.20'),
        hardThreshold: new Decimal('0.10'),
      }),
    ).rejects.toMatchObject({ field: 'softThreshold' });
  });

  it('throws when MAX_DISCOUNT_PCT hard > soft (wrong direction)', async () => {
    const service = new RailService(mockRailRepo());
    const input = {
      productId: 'p1',
      kind: 'MAX_DISCOUNT_PCT' as const,
      marginBasis: 'CONTRIBUTION' as const,
      softThreshold: new Decimal('0.20'),
      hardThreshold: new Decimal('0.30'), // hard > soft is wrong for MAX rails
      isEnabled: true,
    };
    await expect(service.upsert(input)).rejects.toThrow(ValidationError);
    await expect(service.upsert(input)).rejects.toMatchObject({ field: 'hardThreshold' });
  });

  it('throws when MIN_MARGIN_PCT marginBasis is missing', async () => {
    const service = new RailService(mockRailRepo());
    const call = service.upsert({
      ...validMinMarginInput,
      marginBasis: undefined as unknown as 'CONTRIBUTION',
    });
    await expect(call).rejects.toThrow(ValidationError);
    const call2 = service.upsert({
      ...validMinMarginInput,
      marginBasis: undefined as unknown as 'CONTRIBUTION',
    });
    await expect(call2).rejects.toMatchObject({ field: 'marginBasis' });
  });

  it('throws when threshold out of range for percentage rail', async () => {
    const service = new RailService(mockRailRepo());
    const input = {
      ...validMinMarginInput,
      softThreshold: new Decimal('1.5'),
      hardThreshold: new Decimal('2.0'),
    };
    await expect(service.upsert(input)).rejects.toThrow(ValidationError);
    await expect(service.upsert(input)).rejects.toMatchObject({ field: 'softThreshold' });
  });

  it('accepts equal soft and hard thresholds for MIN rails', async () => {
    const repo = mockRailRepo();
    const service = new RailService(repo);
    await expect(
      service.upsert({
        ...validMinMarginInput,
        softThreshold: new Decimal('0.15'),
        hardThreshold: new Decimal('0.15'),
      }),
    ).resolves.toBeDefined();
  });

  it('accepts valid MIN_SEAT_PRICE input with absolute values', async () => {
    const repo = mockRailRepo();
    const service = new RailService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        kind: 'MIN_SEAT_PRICE' as const,
        marginBasis: 'CONTRIBUTION' as const,
        softThreshold: new Decimal('5'),
        hardThreshold: new Decimal('10'),
        isEnabled: true,
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when MIN_SEAT_PRICE threshold is <= 0', async () => {
    const service = new RailService(mockRailRepo());
    const input = {
      productId: 'p1',
      kind: 'MIN_SEAT_PRICE' as const,
      marginBasis: 'CONTRIBUTION' as const,
      softThreshold: new Decimal('0'),
      hardThreshold: new Decimal('5'),
      isEnabled: true,
    };
    await expect(service.upsert(input)).rejects.toThrow(ValidationError);
    await expect(service.upsert(input)).rejects.toMatchObject({ field: 'softThreshold' });
  });

  it('throws when MIN_SEAT_PRICE soft > hard (wrong ordering)', async () => {
    const service = new RailService(mockRailRepo());
    const input = {
      productId: 'p1',
      kind: 'MIN_SEAT_PRICE' as const,
      marginBasis: 'CONTRIBUTION' as const,
      softThreshold: new Decimal('20'),
      hardThreshold: new Decimal('5'),
      isEnabled: true,
    };
    await expect(service.upsert(input)).rejects.toThrow(ValidationError);
    await expect(service.upsert(input)).rejects.toMatchObject({ field: 'softThreshold' });
  });

  it('accepts valid MIN_CONTRACT_MONTHS input with absolute values', async () => {
    const repo = mockRailRepo();
    const service = new RailService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        kind: 'MIN_CONTRACT_MONTHS' as const,
        marginBasis: 'CONTRIBUTION' as const,
        softThreshold: new Decimal('6'),
        hardThreshold: new Decimal('12'),
        isEnabled: true,
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when MIN_CONTRACT_MONTHS threshold is <= 0', async () => {
    const service = new RailService(mockRailRepo());
    const input = {
      productId: 'p1',
      kind: 'MIN_CONTRACT_MONTHS' as const,
      marginBasis: 'CONTRIBUTION' as const,
      softThreshold: new Decimal('6'),
      hardThreshold: new Decimal('0'),
      isEnabled: true,
    };
    await expect(service.upsert(input)).rejects.toThrow(ValidationError);
    await expect(service.upsert(input)).rejects.toMatchObject({ field: 'hardThreshold' });
  });
});
