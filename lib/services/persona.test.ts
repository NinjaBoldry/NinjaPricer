import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { PersonaService } from './persona';
import { ValidationError } from '../utils/errors';
import { mockPersonaRepo } from '../db/repositories/__mocks__/persona';

describe('PersonaService', () => {
  it('accepts valid input', async () => {
    const repo = mockPersonaRepo();
    const service = new PersonaService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        name: 'Standard',
        multiplier: new Decimal('1.00'),
        sortOrder: 0,
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when name is empty', async () => {
    const service = new PersonaService(mockPersonaRepo());
    const call = service.upsert({
      productId: 'p1',
      name: '',
      multiplier: new Decimal('1.00'),
      sortOrder: 0,
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        name: '',
        multiplier: new Decimal('1.00'),
        sortOrder: 0,
      }),
    ).rejects.toMatchObject({ field: 'name' });
  });

  it('throws when multiplier is zero or negative', async () => {
    const service = new PersonaService(mockPersonaRepo());
    const call = service.upsert({
      productId: 'p1',
      name: 'Standard',
      multiplier: new Decimal('0'),
      sortOrder: 0,
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        name: 'Standard',
        multiplier: new Decimal('0'),
        sortOrder: 0,
      }),
    ).rejects.toMatchObject({ field: 'multiplier' });
  });
});
