import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));

vi.mock('@/lib/services/bundle', () => ({
  BundleService: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.update = vi.fn();
    this.delete = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/bundleItem', () => ({
  BundleItemService: vi.fn(function (this: any) {
    this.setForBundle = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/db/repositories/bundle', () => ({ BundleRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/bundleItem', () => ({ BundleItemRepository: vi.fn() }));

import { BundleService } from '@/lib/services/bundle';
import { BundleItemService } from '@/lib/services/bundleItem';

import {
  createBundleTool,
  updateBundleTool,
  deleteBundleTool,
  setBundleItemsTool,
  bundleTools,
} from './bundles';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('bundle catalog tools', () => {
  let bundleSvc: any;
  let bundleItemSvc: any;

  beforeEach(() => {
    vi.clearAllMocks();

    bundleSvc = new (BundleService as any)();
    bundleItemSvc = new (BundleItemService as any)();

    (BundleService as any).mockImplementation(function (this: any) {
      Object.assign(this, bundleSvc);
      return this;
    });
    (BundleItemService as any).mockImplementation(function (this: any) {
      Object.assign(this, bundleItemSvc);
      return this;
    });
  });

  it('exports 4 tools in bundleTools array', () => {
    expect(bundleTools).toHaveLength(4);
  });

  // ---------------------------------------------------------------------------
  // create_bundle
  // ---------------------------------------------------------------------------
  describe('create_bundle', () => {
    it('is admin + isWrite + targetEntityType=Bundle', () => {
      expect(createBundleTool.requiresAdmin).toBe(true);
      expect(createBundleTool.isWrite).toBe(true);
      expect(createBundleTool.targetEntityType).toBe('Bundle');
    });

    it('calls service.create and returns {id}', async () => {
      bundleSvc.create.mockResolvedValue({ id: 'b1' });
      const out = await createBundleTool.handler(adminCtx, {
        name: 'Enterprise Starter',
        description: 'A starter bundle',
      });
      expect(bundleSvc.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Enterprise Starter', description: 'A starter bundle' }),
      );
      expect(out).toEqual({ id: 'b1' });
    });

    it('rejects missing name', () => {
      expect(() => createBundleTool.inputSchema.parse({ description: 'x' })).toThrow();
    });

    it('rejects extra unknown fields', () => {
      expect(() => createBundleTool.inputSchema.parse({ name: 'B', unknownField: true })).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_bundle
  // ---------------------------------------------------------------------------
  describe('update_bundle', () => {
    it('is admin + isWrite + targetEntityType=Bundle', () => {
      expect(updateBundleTool.requiresAdmin).toBe(true);
      expect(updateBundleTool.isWrite).toBe(true);
      expect(updateBundleTool.targetEntityType).toBe('Bundle');
    });

    it('calls service.update with id and patch, returns {id}', async () => {
      bundleSvc.update.mockResolvedValue({ id: 'b1' });
      const out = await updateBundleTool.handler(adminCtx, {
        id: 'b1',
        name: 'Renamed Bundle',
        isActive: false,
      });
      expect(bundleSvc.update).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ name: 'Renamed Bundle', isActive: false }),
      );
      expect(out).toEqual({ id: 'b1' });
    });

    it('rejects missing id', () => {
      expect(() => updateBundleTool.inputSchema.parse({ name: 'X' })).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_bundle
  // ---------------------------------------------------------------------------
  describe('delete_bundle', () => {
    it('is admin + isWrite + targetEntityType=Bundle', () => {
      expect(deleteBundleTool.requiresAdmin).toBe(true);
      expect(deleteBundleTool.isWrite).toBe(true);
      expect(deleteBundleTool.targetEntityType).toBe('Bundle');
    });

    it('calls service.delete with id and returns {id}', async () => {
      bundleSvc.delete.mockResolvedValue(undefined);
      const out = await deleteBundleTool.handler(adminCtx, { id: 'b1' });
      expect(bundleSvc.delete).toHaveBeenCalledWith('b1');
      expect(out).toEqual({ id: 'b1' });
    });
  });

  // ---------------------------------------------------------------------------
  // set_bundle_items
  // ---------------------------------------------------------------------------
  describe('set_bundle_items', () => {
    it('is admin + isWrite + targetEntityType=Bundle', () => {
      expect(setBundleItemsTool.requiresAdmin).toBe(true);
      expect(setBundleItemsTool.isWrite).toBe(true);
      expect(setBundleItemsTool.targetEntityType).toBe('Bundle');
    });

    it('calls service.setForBundle with SAAS_CONFIG item, returns {bundleId}', async () => {
      bundleItemSvc.setForBundle.mockResolvedValue(undefined);
      const out = await setBundleItemsTool.handler(adminCtx, {
        bundleId: 'b1',
        items: [
          {
            kind: 'SAAS_CONFIG',
            saasConfig: {
              productId: 'p1',
              seatCount: 50,
              personaMix: [{ personaId: 'per1', pct: 1 }],
            },
          },
        ],
      });
      expect(bundleItemSvc.setForBundle).toHaveBeenCalledWith(
        'b1',
        expect.arrayContaining([expect.objectContaining({ productId: 'p1' })]),
        expect.anything(),
      );
      expect(out).toEqual({ bundleId: 'b1' });
    });

    it('calls service.setForBundle with LABOR_SKU item', async () => {
      bundleItemSvc.setForBundle.mockResolvedValue(undefined);
      await setBundleItemsTool.handler(adminCtx, {
        bundleId: 'b1',
        items: [
          {
            kind: 'LABOR_SKU',
            laborRef: { productId: 'p2', skuId: 'sku1', qty: 3 },
          },
        ],
      });
      const [, itemsArg] = bundleItemSvc.setForBundle.mock.calls[0];
      expect(itemsArg[0]).toMatchObject({ productId: 'p2', skuId: 'sku1' });
    });

    it('calls service.setForBundle with DEPARTMENT_HOURS item', async () => {
      bundleItemSvc.setForBundle.mockResolvedValue(undefined);
      await setBundleItemsTool.handler(adminCtx, {
        bundleId: 'b1',
        items: [
          {
            kind: 'DEPARTMENT_HOURS',
            laborRef: { productId: 'p3', departmentId: 'dept1', hours: 40 },
          },
        ],
      });
      const [, itemsArg] = bundleItemSvc.setForBundle.mock.calls[0];
      expect(itemsArg[0]).toMatchObject({ productId: 'p3', departmentId: 'dept1' });
    });

    it('replaces entire item set (passes all items to service)', async () => {
      bundleItemSvc.setForBundle.mockResolvedValue(undefined);
      await setBundleItemsTool.handler(adminCtx, {
        bundleId: 'b1',
        items: [
          {
            kind: 'SAAS_CONFIG',
            saasConfig: { productId: 'p1', seatCount: 10, personaMix: [] },
          },
          {
            kind: 'LABOR_SKU',
            laborRef: { productId: 'p2', skuId: 'sku1', qty: 2 },
          },
        ],
      });
      const [, itemsArg] = bundleItemSvc.setForBundle.mock.calls[0];
      expect(itemsArg).toHaveLength(2);
    });

    it('allows clearing all items with empty array', async () => {
      bundleItemSvc.setForBundle.mockResolvedValue(undefined);
      const out = await setBundleItemsTool.handler(adminCtx, { bundleId: 'b1', items: [] });
      expect(bundleItemSvc.setForBundle).toHaveBeenCalledWith('b1', [], expect.anything());
      expect(out).toEqual({ bundleId: 'b1' });
    });

    it('rejects unknown kind', () => {
      expect(() =>
        setBundleItemsTool.inputSchema.parse({
          bundleId: 'b1',
          items: [{ kind: 'UNKNOWN_KIND' }],
        }),
      ).toThrow();
    });

    it('rejects missing bundleId', () => {
      expect(() => setBundleItemsTool.inputSchema.parse({ items: [] })).toThrow();
    });
  });
});
