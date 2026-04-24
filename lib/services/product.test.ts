import { describe, it, expect, vi } from 'vitest';
import { ProductService } from './product';
import { ValidationError } from '../utils/errors';
import { mockProductRepo } from '../db/repositories/__mocks__/product';

describe('ProductService', () => {
  it('throws ValidationError with field "name" when name is empty', async () => {
    const service = new ProductService(mockProductRepo());
    await expect(service.createProduct({ name: '', kind: 'SAAS_USAGE' })).rejects.toThrow(
      ValidationError,
    );
    await expect(service.createProduct({ name: '', kind: 'SAAS_USAGE' })).rejects.toMatchObject({
      field: 'name',
    });
  });

  it('throws ValidationError with field "kind" when kind is invalid', async () => {
    const service = new ProductService(mockProductRepo());
    await expect(
      service.createProduct({ name: 'Test', kind: 'INVALID' as 'SAAS_USAGE' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.createProduct({ name: 'Test', kind: 'INVALID' as 'SAAS_USAGE' }),
    ).rejects.toMatchObject({ field: 'kind' });
  });

  it('creates a product when data is valid', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    const result = await service.createProduct({ name: 'Ninja Notes', kind: 'SAAS_USAGE' });
    expect(result.name).toBe('Ninja Notes');
    expect(repo.create).toHaveBeenCalledWith({
      name: 'Ninja Notes',
      kind: 'SAAS_USAGE',
      isActive: true,
      revenueModel: 'PER_SEAT',
    });
  });

  it('throws ValidationError with field "name" when updating with empty name', async () => {
    const service = new ProductService(mockProductRepo());
    await expect(service.updateProduct('p1', { name: '' })).rejects.toThrow(ValidationError);
    await expect(service.updateProduct('p1', { name: '' })).rejects.toMatchObject({
      field: 'name',
    });
  });

  it('calls repo.update with only defined fields', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    await service.updateProduct('p1', { name: 'New Name' });
    expect(repo.update).toHaveBeenCalledWith('p1', { name: 'New Name' });
  });
});

describe('ProductService — description + sku validation', () => {
  it('trims description and passes through non-empty value', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    await service.createProduct({
      name: 'Test',
      kind: 'SAAS_USAGE',
      description: '  A description  ',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'A description' }),
    );
  });

  it('coerces empty description to null', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    await service.createProduct({ name: 'Test', kind: 'SAAS_USAGE', description: '   ' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });

  it('uppercases and trims sku', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    await service.createProduct({ name: 'Test', kind: 'SAAS_USAGE', sku: '  nn-01  ' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ sku: 'NN-01' }));
  });

  it('coerces empty sku to null', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    await service.createProduct({ name: 'Test', kind: 'SAAS_USAGE', sku: '' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ sku: null }));
  });

  it('throws ValidationError for sku with invalid characters', async () => {
    const service = new ProductService(mockProductRepo());
    await expect(
      service.createProduct({ name: 'Test', kind: 'SAAS_USAGE', sku: 'INVALID SKU!' }),
    ).rejects.toMatchObject({ field: 'sku' });
  });

  it('passes description + sku through updateProduct', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    await service.updateProduct('p1', { description: 'Updated desc', sku: 'NU-02' });
    expect(repo.update).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ description: 'Updated desc', sku: 'NU-02' }),
    );
  });
});

describe('ProductService — revenueModel invariants (phase 6)', () => {
  it('createProduct — accepts revenueModel for SAAS_USAGE', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    await service.createProduct({
      name: 'Omni Concierge',
      kind: 'SAAS_USAGE',
      revenueModel: 'METERED',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ revenueModel: 'METERED' }),
    );
  });

  it('createProduct — defaults revenueModel to PER_SEAT when omitted', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    await service.createProduct({ name: 'X', kind: 'SAAS_USAGE' });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ revenueModel: 'PER_SEAT' }),
    );
  });

  it('createProduct — rejects revenueModel METERED for non-SAAS kinds', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    await expect(
      service.createProduct({
        name: 'X',
        kind: 'PACKAGED_LABOR',
        revenueModel: 'METERED' as 'METERED',
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.createProduct({
        name: 'X',
        kind: 'PACKAGED_LABOR',
        revenueModel: 'METERED' as 'METERED',
      }),
    ).rejects.toMatchObject({ field: 'revenueModel' });
  });

  it('updateProduct — rejects revenueModel change once MeteredPricing exists', async () => {
    const repo = mockProductRepo();
    repo.findById = vi.fn().mockResolvedValue({
      id: 'p1',
      kind: 'SAAS_USAGE',
      revenueModel: 'METERED',
    });
    repo.findMeteredPricingByProductId = vi.fn().mockResolvedValue({ id: 'm1' });
    const service = new ProductService(repo);
    await expect(
      service.updateProduct('p1', { revenueModel: 'PER_SEAT' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.updateProduct('p1', { revenueModel: 'PER_SEAT' }),
    ).rejects.toMatchObject({ field: 'revenueModel' });
  });

  it('updateProduct — rejects revenueModel change once ListPrice exists', async () => {
    const repo = mockProductRepo();
    repo.findById = vi.fn().mockResolvedValue({
      id: 'p1',
      kind: 'SAAS_USAGE',
      revenueModel: 'PER_SEAT',
    });
    repo.findListPriceByProductId = vi.fn().mockResolvedValue({ id: 'lp1' });
    const service = new ProductService(repo);
    await expect(
      service.updateProduct('p1', { revenueModel: 'METERED' }),
    ).rejects.toThrow(ValidationError);
  });

  it('updateProduct — rejects revenueModel change once scenarios reference product', async () => {
    const repo = mockProductRepo();
    repo.findById = vi.fn().mockResolvedValue({
      id: 'p1',
      kind: 'SAAS_USAGE',
      revenueModel: 'PER_SEAT',
    });
    repo.countScenarioSaaSConfigsByProductId = vi.fn().mockResolvedValue(3);
    const service = new ProductService(repo);
    await expect(
      service.updateProduct('p1', { revenueModel: 'METERED' }),
    ).rejects.toThrow(ValidationError);
  });

  it('updateProduct — allows revenueModel change when no references exist', async () => {
    const repo = mockProductRepo();
    repo.findById = vi.fn().mockResolvedValue({
      id: 'p1',
      kind: 'SAAS_USAGE',
      revenueModel: 'PER_SEAT',
    });
    const service = new ProductService(repo);
    await service.updateProduct('p1', { revenueModel: 'METERED' });
    expect(repo.update).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ revenueModel: 'METERED' }),
    );
  });

  it('updateProduct — no-op when revenueModel matches existing value, even with references', async () => {
    const repo = mockProductRepo();
    repo.findById = vi.fn().mockResolvedValue({
      id: 'p1',
      kind: 'SAAS_USAGE',
      revenueModel: 'METERED',
    });
    repo.findMeteredPricingByProductId = vi.fn().mockResolvedValue({ id: 'm1' });
    const service = new ProductService(repo);
    await service.updateProduct('p1', { revenueModel: 'METERED' });
    expect(repo.update).toHaveBeenCalled();
  });
});
