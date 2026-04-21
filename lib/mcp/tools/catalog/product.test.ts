import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/services/product', () => ({
  ProductService: vi.fn(function (this: any) {
    this.createProduct = vi.fn();
    this.updateProduct = vi.fn();
    this.deleteProduct = vi.fn();
    return this;
  }),
}));

import { ProductService } from '@/lib/services/product';
import { createProductTool, updateProductTool, deleteProductTool } from './product';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('product catalog tools', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ProductService as any)();
    (ProductService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('all are admin + isWrite', () => {
    for (const tool of [createProductTool, updateProductTool, deleteProductTool]) {
      expect(tool.requiresAdmin).toBe(true);
      expect(tool.isWrite).toBe(true);
      expect(tool.targetEntityType).toBe('Product');
    }
  });

  describe('create_product', () => {
    it('creates with name + kind, returns {id}', async () => {
      svc.createProduct.mockResolvedValue({ id: 'p1' });
      const out = await createProductTool.handler(adminCtx, {
        name: 'Ninja Notes',
        kind: 'SAAS_USAGE',
      });
      expect(svc.createProduct).toHaveBeenCalledWith({
        name: 'Ninja Notes',
        kind: 'SAAS_USAGE',
      });
      expect(out).toEqual({ id: 'p1' });
    });

    it('rejects invalid kind', () => {
      expect(() => createProductTool.inputSchema.parse({ name: 'X', kind: 'INVALID' })).toThrow();
    });
  });

  describe('update_product', () => {
    it('accepts isActive directly and passes it through unchanged', async () => {
      svc.updateProduct.mockResolvedValue({ id: 'p1' });
      await updateProductTool.handler(adminCtx, {
        id: 'p1',
        name: 'Renamed',
        isActive: false,
      });
      expect(svc.updateProduct).toHaveBeenCalledWith('p1', {
        name: 'Renamed',
        isActive: false,
      });
    });

    it('setting isActive: true re-enables the product', async () => {
      svc.updateProduct.mockResolvedValue({ id: 'p1' });
      await updateProductTool.handler(adminCtx, {
        id: 'p1',
        isActive: true,
      });
      expect(svc.updateProduct).toHaveBeenCalledWith('p1', { isActive: true });
    });

    it('does not accept isArchived (removed from schema)', () => {
      expect(() => updateProductTool.inputSchema.parse({ id: 'p1', isArchived: true })).toThrow();
    });

    it('rejects empty patch', () => {
      expect(() => updateProductTool.inputSchema.parse({ id: 'p1' })).toThrow();
    });
  });

  describe('delete_product', () => {
    it('calls service.deleteProduct', async () => {
      svc.deleteProduct.mockResolvedValue({ id: 'p1' });
      await deleteProductTool.handler(adminCtx, { id: 'p1' });
      expect(svc.deleteProduct).toHaveBeenCalledWith('p1');
    });
  });
});
