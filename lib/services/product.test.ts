import { describe, it, expect } from 'vitest';
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
