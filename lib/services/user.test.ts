import { describe, it, expect, vi } from 'vitest';
import { UserService } from './user';
import { mockUserRepo } from '../db/repositories/__mocks__/user';

const existingAdmin = { id: 'u1', email: 'admin@ninja.com', name: 'Admin', role: 'ADMIN' as const };
const existingSales = { id: 'u2', email: 'sales@ninja.com', name: 'Sales', role: 'SALES' as const };

describe('UserService.setRole', () => {
  it('allows an admin to change another user to ADMIN', async () => {
    const repo = mockUserRepo();
    const service = new UserService(repo);
    await expect(service.setRole('u2', 'ADMIN', 'u1')).resolves.toBeDefined();
    expect(repo.setRole).toHaveBeenCalledOnce();
  });

  it('allows an admin to change another user to SALES', async () => {
    const repo = mockUserRepo();
    const service = new UserService(repo);
    await expect(service.setRole('u2', 'SALES', 'u1')).resolves.toBeDefined();
  });

  it('throws when admin tries to demote themselves from ADMIN', async () => {
    const service = new UserService(mockUserRepo());
    await expect(service.setRole('u1', 'SALES', 'u1')).rejects.toMatchObject({ field: 'role' });
  });

  it('allows admin to keep themselves as ADMIN (no-op)', async () => {
    const repo = mockUserRepo();
    const service = new UserService(repo);
    await expect(service.setRole('u1', 'ADMIN', 'u1')).resolves.toBeDefined();
  });

  it('throws when userId is empty', async () => {
    const service = new UserService(mockUserRepo());
    await expect(service.setRole('', 'ADMIN', 'u1')).rejects.toMatchObject({ field: 'userId' });
  });

  it('throws when actingUserId is empty', async () => {
    const service = new UserService(mockUserRepo());
    await expect(service.setRole('u2', 'ADMIN', '')).rejects.toMatchObject({ field: 'actingUserId' });
  });
});

describe('UserService.invite', () => {
  it('creates a user with email-derived name and SALES role', async () => {
    const repo = mockUserRepo();
    repo.findByEmail = vi.fn().mockResolvedValue(null);
    const service = new UserService(repo);
    await expect(service.invite('alice@ninja.com', 'SALES', 'ninja.com')).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@ninja.com', name: 'alice', role: 'SALES' })
    );
  });

  it('creates a user with ADMIN role when specified', async () => {
    const repo = mockUserRepo();
    repo.findByEmail = vi.fn().mockResolvedValue(null);
    const service = new UserService(repo);
    await expect(service.invite('bob@ninja.com', 'ADMIN', 'ninja.com')).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN' })
    );
  });

  it('throws when email domain does not match allowedDomain', async () => {
    const service = new UserService(mockUserRepo());
    await expect(service.invite('alice@other.com', 'SALES', 'ninja.com'))
      .rejects.toMatchObject({ field: 'email' });
  });

  it('throws when user with that email already exists', async () => {
    const repo = mockUserRepo();
    repo.findByEmail = vi.fn().mockResolvedValue(existingSales);
    const service = new UserService(repo);
    await expect(service.invite('sales@ninja.com', 'SALES', 'ninja.com'))
      .rejects.toMatchObject({ field: 'email' });
  });

  it('skips domain check when allowedDomain is empty string', async () => {
    const repo = mockUserRepo();
    repo.findByEmail = vi.fn().mockResolvedValue(null);
    const service = new UserService(repo);
    await expect(service.invite('anyone@anywhere.io', 'SALES', '')).resolves.toBeDefined();
  });

  it('throws when email is empty', async () => {
    const service = new UserService(mockUserRepo());
    await expect(service.invite('', 'SALES', 'ninja.com')).rejects.toMatchObject({ field: 'email' });
  });

  it('normalises email to lowercase before checking domain and creating', async () => {
    const repo = mockUserRepo();
    repo.findByEmail = vi.fn().mockResolvedValue(null);
    const service = new UserService(repo);
    await service.invite('ALICE@NINJA.COM', 'SALES', 'ninja.com');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@ninja.com' })
    );
  });
});

describe('UserService.listAll / findById', () => {
  it('listAll delegates to repo', async () => {
    const repo = mockUserRepo();
    repo.findAll = vi.fn().mockResolvedValue([existingAdmin, existingSales]);
    const service = new UserService(repo);
    const result = await service.listAll();
    expect(result).toHaveLength(2);
    expect(repo.findAll).toHaveBeenCalledOnce();
  });

  it('findById delegates to repo', async () => {
    const repo = mockUserRepo();
    repo.findById = vi.fn().mockResolvedValue(existingAdmin);
    const service = new UserService(repo);
    const result = await service.findById('u1');
    expect(result).toBeDefined();
    expect(repo.findById).toHaveBeenCalledWith('u1');
  });
});
