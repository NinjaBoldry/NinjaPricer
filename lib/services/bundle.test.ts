import { describe, it, expect, vi } from 'vitest';
import { BundleService } from './bundle';
import { mockBundleRepo } from '../db/repositories/__mocks__/bundle';

describe('BundleService.create', () => {
  it('accepts a valid bundle with name only', async () => {
    const repo = mockBundleRepo();
    const service = new BundleService(repo);
    await expect(service.create({ name: 'Enterprise Starter' })).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('accepts a bundle with optional description', async () => {
    const repo = mockBundleRepo();
    const service = new BundleService(repo);
    await expect(
      service.create({ name: 'Pro Bundle', description: 'Includes all core SKUs' }),
    ).resolves.toBeDefined();
  });

  it('throws when name is empty', async () => {
    const service = new BundleService(mockBundleRepo());
    await expect(service.create({ name: '' })).rejects.toMatchObject({ field: 'name' });
  });

  it('throws when name is missing', async () => {
    const service = new BundleService(mockBundleRepo());
    await expect(service.create({})).rejects.toMatchObject({ field: 'name' });
  });
});

describe('BundleService.update', () => {
  it('accepts a valid name update', async () => {
    const repo = mockBundleRepo();
    const service = new BundleService(repo);
    await expect(service.update('b1', { name: 'New Name' })).resolves.toBeDefined();
    expect(repo.update).toHaveBeenCalledOnce();
  });

  it('throws when name is updated to empty string', async () => {
    const service = new BundleService(mockBundleRepo());
    await expect(service.update('b1', { name: '' })).rejects.toMatchObject({ field: 'name' });
  });
});

describe('BundleService — sku validation', () => {
  it('uppercases and trims sku on create', async () => {
    const repo = mockBundleRepo();
    const service = new BundleService(repo);
    await service.create({ name: 'Test Bundle', sku: '  eb-01  ' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ sku: 'EB-01' }));
  });

  it('coerces empty sku to null on create', async () => {
    const repo = mockBundleRepo();
    const service = new BundleService(repo);
    await service.create({ name: 'Test Bundle', sku: '' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ sku: null }));
  });

  it('throws ValidationError for sku with invalid characters on create', async () => {
    const service = new BundleService(mockBundleRepo());
    await expect(
      service.create({ name: 'Test Bundle', sku: 'INVALID SKU!' }),
    ).rejects.toMatchObject({ field: 'sku' });
  });

  it('coerces empty description to null on create', async () => {
    const repo = mockBundleRepo();
    const service = new BundleService(repo);
    await service.create({ name: 'Test Bundle', description: '   ' });
    // description coerces to null (undefined) — repo.create should not get description: '   '
    const callArg = (repo.create as any).mock.calls[0][0];
    expect(callArg.description).toBeUndefined(); // null transforms to undefined in create path
  });

  it('passes sku through update', async () => {
    const repo = mockBundleRepo();
    const service = new BundleService(repo);
    await service.update('b1', { sku: 'ES-02' });
    expect(repo.update).toHaveBeenCalledWith('b1', expect.objectContaining({ sku: 'ES-02' }));
  });

  it('throws ValidationError for invalid sku on update', async () => {
    const service = new BundleService(mockBundleRepo());
    await expect(
      service.update('b1', { name: 'Valid Name', sku: 'INVALID!' }),
    ).rejects.toMatchObject({ field: 'sku' });
  });
});

describe('BundleService.findAll / findById', () => {
  it('findAll delegates to repo', async () => {
    const repo = mockBundleRepo();
    repo.findAll = vi.fn().mockResolvedValue([{ id: 'b1', name: 'Test' }]);
    const service = new BundleService(repo);
    const result = await service.findAll();
    expect(result).toHaveLength(1);
    expect(repo.findAll).toHaveBeenCalledOnce();
  });

  it('findById delegates to repo', async () => {
    const repo = mockBundleRepo();
    repo.findById = vi.fn().mockResolvedValue({ id: 'b1', name: 'Test' });
    const service = new BundleService(repo);
    const result = await service.findById('b1');
    expect(result).toBeDefined();
    expect(repo.findById).toHaveBeenCalledWith('b1');
  });
});
