import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/services/scenario', () => ({
  ScenarioService: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.update = vi.fn();
    this.archive = vi.fn();
    return this;
  }),
  getScenarioById: vi.fn(),
  upsertSaasConfig: vi.fn(),
  setLaborLines: vi.fn(),
  applyBundleToScenario: vi.fn(),
}));

import { ScenarioService, getScenarioById } from '@/lib/services/scenario';
import {
  createScenarioTool,
  updateScenarioTool,
  archiveScenarioTool,
} from './scenarioWrites';
import { NotFoundError } from '@/lib/utils/errors';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};
const salesCtx: McpContext = {
  user: { id: 'u2', email: 's@b', name: null, role: 'SALES' },
  token: { id: 't2', label: 'y', ownerUserId: 'u2' },
};

describe('create_scenario', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ScenarioService as any)();
    svc.create.mockResolvedValue({ id: 's_new' });
    (ScenarioService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('isWrite=true with Scenario target type', () => {
    expect(createScenarioTool.isWrite).toBe(true);
    expect(createScenarioTool.targetEntityType).toBe('Scenario');
  });

  it('creates a scenario owned by the caller and returns {id}', async () => {
    const out = await createScenarioTool.handler(adminCtx, {
      name: 'Acme',
      customerName: 'Acme Inc',
      contractMonths: 12,
    });
    expect(svc.create).toHaveBeenCalledWith({
      name: 'Acme',
      customerName: 'Acme Inc',
      contractMonths: 12,
      ownerId: 'u1',
    });
    expect(out).toEqual({ id: 's_new' });
  });

  it('accepts optional notes', async () => {
    await createScenarioTool.handler(adminCtx, {
      name: 'X',
      customerName: 'Y',
      contractMonths: 6,
      notes: 'hello',
    });
    expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({ notes: 'hello' }));
  });

  it('rejects contractMonths < 1 via Zod', () => {
    expect(() =>
      createScenarioTool.inputSchema.parse({
        name: 'X',
        customerName: 'Y',
        contractMonths: 0,
      }),
    ).toThrow();
  });
});

describe('update_scenario', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ScenarioService as any)();
    svc.update.mockResolvedValue({ id: 's1' });
    (ScenarioService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('sales caller cannot update someone else\'s scenario → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'other' } as any);
    await expect(updateScenarioTool.handler(salesCtx, { id: 's1', name: 'X' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('sales caller CAN update their own scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    await updateScenarioTool.handler(salesCtx, { id: 's1', name: 'X' });
    expect(svc.update).toHaveBeenCalledWith('s1', { name: 'X' });
  });

  it('admin can update any scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'someone' } as any);
    await updateScenarioTool.handler(adminCtx, { id: 's1', contractMonths: 24 });
    expect(svc.update).toHaveBeenCalledWith('s1', { contractMonths: 24 });
  });
});

describe('archive_scenario', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ScenarioService as any)();
    svc.archive.mockResolvedValue({ id: 's1' });
    (ScenarioService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('sales caller: own scenario archives', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    await archiveScenarioTool.handler(salesCtx, { id: 's1' });
    expect(svc.archive).toHaveBeenCalledWith('s1');
  });

  it('sales caller: other owner → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'x' } as any);
    await expect(archiveScenarioTool.handler(salesCtx, { id: 's1' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
