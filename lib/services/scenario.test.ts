import { describe, it, expect } from 'vitest';
import { ScenarioService } from './scenario';
import { mockScenarioRepo } from '../db/repositories/__mocks__/scenario';

describe('ScenarioService.create', () => {
  it('creates successfully with valid data', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo);
    await expect(
      service.create({ name: 'Q1 Deal', customerName: 'Acme', ownerId: 'u1', contractMonths: 12 }),
    ).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('throws ValidationError when name is empty', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: '', customerName: 'Acme', ownerId: 'u1', contractMonths: 12 }),
    ).rejects.toMatchObject({ field: 'name' });
  });

  it('throws ValidationError when customerName is empty', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: 'Q1 Deal', customerName: '', ownerId: 'u1', contractMonths: 12 }),
    ).rejects.toMatchObject({ field: 'customerName' });
  });

  it('throws ValidationError when ownerId is empty', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: 'Q1 Deal', customerName: 'Acme', ownerId: '', contractMonths: 12 }),
    ).rejects.toMatchObject({ field: 'ownerId' });
  });

  it('throws ValidationError when contractMonths < 1', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: 'Q1 Deal', customerName: 'Acme', ownerId: 'u1', contractMonths: 0 }),
    ).rejects.toMatchObject({ field: 'contractMonths' });
  });

  it('throws ValidationError when contractMonths is not an integer', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: 'Q1 Deal', customerName: 'Acme', ownerId: 'u1', contractMonths: 1.5 }),
    ).rejects.toMatchObject({ field: 'contractMonths' });
  });
});

describe('ScenarioService.update', () => {
  it('updates successfully with valid partial data', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo);
    await expect(service.update('s1', { name: 'Renamed Deal' })).resolves.toBeDefined();
    expect(repo.update).toHaveBeenCalledOnce();
  });

  it('throws ValidationError when id is empty', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(service.update('', { name: 'Renamed Deal' })).rejects.toMatchObject({
      field: 'id',
    });
  });

  it('throws ValidationError when name is empty string if name is present in data', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(service.update('s1', { name: '' })).rejects.toMatchObject({ field: 'name' });
  });

  it('throws ValidationError when contractMonths < 1 if contractMonths present', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(service.update('s1', { contractMonths: 0 })).rejects.toMatchObject({
      field: 'contractMonths',
    });
  });
});

describe('ScenarioService.listWithFilters', () => {
  it('delegates to repo with actingUser', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo);
    const params = { actingUser: { id: 'u1', role: 'SALES' as const } };
    await expect(service.listWithFilters(params)).resolves.toEqual([]);
    expect(repo.listWithFilters).toHaveBeenCalledWith(params);
  });
});

describe('ScenarioService.archive', () => {
  it('delegates to repo', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo);
    await expect(service.archive('s1')).resolves.toBeDefined();
    expect(repo.archive).toHaveBeenCalledWith('s1');
  });
});

import {
  upsertSaasConfig,
  setLaborLines,
  applyBundleToScenario,
  unapplyBundleFromScenario,
} from './scenario';

describe('upsertSaasConfig', () => {
  it('is exported as a function', () => {
    expect(typeof upsertSaasConfig).toBe('function');
  });
});

describe('setLaborLines', () => {
  it('is exported as a function', () => {
    expect(typeof setLaborLines).toBe('function');
  });
});

describe('applyBundleToScenario', () => {
  it('is exported as a function', () => {
    expect(typeof applyBundleToScenario).toBe('function');
  });
});

describe('unapplyBundleFromScenario', () => {
  it('is exported as a function', () => {
    expect(typeof unapplyBundleFromScenario).toBe('function');
  });
});
