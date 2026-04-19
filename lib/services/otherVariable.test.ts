import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { OtherVariableService } from './otherVariable';
import { ValidationError } from '../utils/errors';
import { mockOtherVariableRepo } from '../db/repositories/__mocks__/otherVariable';

describe('OtherVariableService', () => {
  it('accepts valid input', async () => {
    const repo = mockOtherVariableRepo();
    const service = new OtherVariableService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        usdPerUserPerMonth: new Decimal('5'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when usdPerUserPerMonth is negative', async () => {
    const service = new OtherVariableService(mockOtherVariableRepo());
    const call = service.upsert({
      productId: 'p1',
      usdPerUserPerMonth: new Decimal('-1'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        usdPerUserPerMonth: new Decimal('-1'),
      }),
    ).rejects.toMatchObject({ field: 'usdPerUserPerMonth' });
  });
});
