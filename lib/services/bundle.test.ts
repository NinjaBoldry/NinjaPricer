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
      service.create({ name: 'Pro Bundle', description: 'Includes all core SKUs' })
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
