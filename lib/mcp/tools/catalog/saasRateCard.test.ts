import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));

vi.mock('@/lib/services/vendorRate', () => ({
  VendorRateService: vi.fn(function (this: any) {
    this.upsert = vi.fn();
    this.create = vi.fn();
    this.update = vi.fn();
    this.delete = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/baseUsage', () => ({
  BaseUsageService: vi.fn(function (this: any) {
    this.setForProduct = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/otherVariable', () => ({
  OtherVariableService: vi.fn(function (this: any) {
    this.upsert = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/persona', () => ({
  PersonaService: vi.fn(function (this: any) {
    this.upsert = vi.fn();
    this.delete = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/productFixedCost', () => ({
  ProductFixedCostService: vi.fn(function (this: any) {
    this.upsert = vi.fn();
    this.delete = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/productScale', () => ({
  ProductScaleService: vi.fn(function (this: any) {
    this.upsert = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/listPrice', () => ({
  ListPriceService: vi.fn(function (this: any) {
    this.upsert = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/volumeDiscountTier', () => ({
  VolumeDiscountTierService: vi.fn(function (this: any) {
    this.setForProduct = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/contractLengthModifier', () => ({
  ContractLengthModifierService: vi.fn(function (this: any) {
    this.setForProduct = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/db/repositories/vendorRate', () => ({ VendorRateRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/baseUsage', () => ({ BaseUsageRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/otherVariable', () => ({ OtherVariableRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/persona', () => ({ PersonaRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/productFixedCost', () => ({ ProductFixedCostRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/productScale', () => ({ ProductScaleRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/listPrice', () => ({ ListPriceRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/volumeDiscountTier', () => ({
  VolumeDiscountTierRepository: vi.fn(),
}));
vi.mock('@/lib/db/repositories/contractLengthModifier', () => ({
  ContractLengthModifierRepository: vi.fn(),
}));

import { VendorRateService } from '@/lib/services/vendorRate';
import { BaseUsageService } from '@/lib/services/baseUsage';
import { OtherVariableService } from '@/lib/services/otherVariable';
import { PersonaService } from '@/lib/services/persona';
import { ProductFixedCostService } from '@/lib/services/productFixedCost';
import { ProductScaleService } from '@/lib/services/productScale';
import { ListPriceService } from '@/lib/services/listPrice';
import { VolumeDiscountTierService } from '@/lib/services/volumeDiscountTier';
import { ContractLengthModifierService } from '@/lib/services/contractLengthModifier';

import {
  createVendorRateTool,
  updateVendorRateTool,
  deleteVendorRateTool,
  setBaseUsageTool,
  setOtherVariableTool,
  createPersonaTool,
  updatePersonaTool,
  deletePersonaTool,
  createFixedCostTool,
  updateFixedCostTool,
  deleteFixedCostTool,
  setProductScaleTool,
  setListPriceTool,
  setVolumeTiersTool,
  setContractModifiersTool,
  saasRateCardTools,
} from './saasRateCard';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

// Helper to get a fresh service mock instance
function getSvc<T>(MockClass: any): T {
  return new MockClass() as T;
}

describe('SaaS rate card catalog tools', () => {
  let vendorRateSvc: any;
  let baseUsageSvc: any;
  let otherVariableSvc: any;
  let personaSvc: any;
  let fixedCostSvc: any;
  let productScaleSvc: any;
  let listPriceSvc: any;
  let volumeTierSvc: any;
  let contractModSvc: any;

  beforeEach(() => {
    vi.clearAllMocks();

    vendorRateSvc = getSvc(VendorRateService);
    baseUsageSvc = getSvc(BaseUsageService);
    otherVariableSvc = getSvc(OtherVariableService);
    personaSvc = getSvc(PersonaService);
    fixedCostSvc = getSvc(ProductFixedCostService);
    productScaleSvc = getSvc(ProductScaleService);
    listPriceSvc = getSvc(ListPriceService);
    volumeTierSvc = getSvc(VolumeDiscountTierService);
    contractModSvc = getSvc(ContractLengthModifierService);

    (VendorRateService as any).mockImplementation(function (this: any) {
      Object.assign(this, vendorRateSvc);
      return this;
    });
    (BaseUsageService as any).mockImplementation(function (this: any) {
      Object.assign(this, baseUsageSvc);
      return this;
    });
    (OtherVariableService as any).mockImplementation(function (this: any) {
      Object.assign(this, otherVariableSvc);
      return this;
    });
    (PersonaService as any).mockImplementation(function (this: any) {
      Object.assign(this, personaSvc);
      return this;
    });
    (ProductFixedCostService as any).mockImplementation(function (this: any) {
      Object.assign(this, fixedCostSvc);
      return this;
    });
    (ProductScaleService as any).mockImplementation(function (this: any) {
      Object.assign(this, productScaleSvc);
      return this;
    });
    (ListPriceService as any).mockImplementation(function (this: any) {
      Object.assign(this, listPriceSvc);
      return this;
    });
    (VolumeDiscountTierService as any).mockImplementation(function (this: any) {
      Object.assign(this, volumeTierSvc);
      return this;
    });
    (ContractLengthModifierService as any).mockImplementation(function (this: any) {
      Object.assign(this, contractModSvc);
      return this;
    });
  });

  it('exports 15 tools in saasRateCardTools array', () => {
    expect(saasRateCardTools).toHaveLength(15);
  });

  // ---------------------------------------------------------------------------
  // create_vendor_rate
  // ---------------------------------------------------------------------------
  describe('create_vendor_rate', () => {
    it('is admin + isWrite + targetEntityType=VendorRate', () => {
      expect(createVendorRateTool.requiresAdmin).toBe(true);
      expect(createVendorRateTool.isWrite).toBe(true);
      expect(createVendorRateTool.targetEntityType).toBe('VendorRate');
    });

    it('calls svc.create (not upsert) and returns {id}', async () => {
      vendorRateSvc.create.mockResolvedValue({ id: 'vr1' });
      const out = await createVendorRateTool.handler(adminCtx, {
        productId: 'p1',
        name: 'AWS S3',
        unitLabel: 'GB',
        rateUsd: '0.023',
      });
      expect(vendorRateSvc.create).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1', name: 'AWS S3', unitLabel: 'GB' }),
      );
      expect(vendorRateSvc.upsert).not.toHaveBeenCalled();
      expect(out).toEqual({ id: 'vr1' });
    });

    it('rejects missing productId', () => {
      expect(() =>
        createVendorRateTool.inputSchema.parse({ name: 'X', unitLabel: 'Y', rateUsd: '1' }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_vendor_rate
  // ---------------------------------------------------------------------------
  describe('update_vendor_rate', () => {
    it('is admin + isWrite + targetEntityType=VendorRate', () => {
      expect(updateVendorRateTool.requiresAdmin).toBe(true);
      expect(updateVendorRateTool.isWrite).toBe(true);
      expect(updateVendorRateTool.targetEntityType).toBe('VendorRate');
    });

    it('calls svc.update(id, patch) — no productId required — and returns {id}', async () => {
      vendorRateSvc.update.mockResolvedValue({ id: 'vr1' });
      const out = await updateVendorRateTool.handler(adminCtx, {
        id: 'vr1',
        rateUsd: '0.05',
      });
      expect(vendorRateSvc.update).toHaveBeenCalledWith('vr1', expect.objectContaining({}));
      expect(vendorRateSvc.upsert).not.toHaveBeenCalled();
      expect(out).toEqual({ id: 'vr1' });
    });

    it('does not require productId', () => {
      // productId is no longer in the schema — this should parse fine
      expect(() =>
        updateVendorRateTool.inputSchema.parse({ id: 'vr1', rateUsd: '1' }),
      ).not.toThrow();
    });

    it('rejects missing id', () => {
      expect(() =>
        updateVendorRateTool.inputSchema.parse({ rateUsd: '1' }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_vendor_rate
  // ---------------------------------------------------------------------------
  describe('delete_vendor_rate', () => {
    it('is admin + isWrite + targetEntityType=VendorRate', () => {
      expect(deleteVendorRateTool.requiresAdmin).toBe(true);
      expect(deleteVendorRateTool.isWrite).toBe(true);
      expect(deleteVendorRateTool.targetEntityType).toBe('VendorRate');
    });

    it('calls delete with id', async () => {
      vendorRateSvc.delete.mockResolvedValue(undefined);
      await deleteVendorRateTool.handler(adminCtx, { id: 'vr1' });
      expect(vendorRateSvc.delete).toHaveBeenCalledWith('vr1');
    });
  });

  // ---------------------------------------------------------------------------
  // set_base_usage
  // ---------------------------------------------------------------------------
  describe('set_base_usage', () => {
    it('is admin + isWrite + targetEntityType=Product', () => {
      expect(setBaseUsageTool.requiresAdmin).toBe(true);
      expect(setBaseUsageTool.isWrite).toBe(true);
      expect(setBaseUsageTool.targetEntityType).toBe('Product');
    });

    it('calls setForProduct with entries and returns {productId}', async () => {
      baseUsageSvc.setForProduct.mockResolvedValue(undefined);
      const out = await setBaseUsageTool.handler(adminCtx, {
        productId: 'p1',
        entries: [{ vendorRateId: 'vr1', usagePerMonth: '100' }],
      });
      expect(baseUsageSvc.setForProduct).toHaveBeenCalledWith(
        'p1',
        expect.arrayContaining([expect.objectContaining({ vendorRateId: 'vr1' })]),
        expect.anything(),
      );
      expect(out).toEqual({ productId: 'p1' });
    });

    it('replaces entire set — passes full entries array to service', async () => {
      baseUsageSvc.setForProduct.mockResolvedValue(undefined);
      await setBaseUsageTool.handler(adminCtx, {
        productId: 'p1',
        entries: [
          { vendorRateId: 'vr1', usagePerMonth: '100' },
          { vendorRateId: 'vr2', usagePerMonth: '200' },
        ],
      });
      const [, entries] = baseUsageSvc.setForProduct.mock.calls[0];
      expect(entries).toHaveLength(2);
    });

    it('rejects missing productId', () => {
      expect(() =>
        setBaseUsageTool.inputSchema.parse({ entries: [{ vendorRateId: 'v', usagePerMonth: '1' }] }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // set_other_variable
  // ---------------------------------------------------------------------------
  describe('set_other_variable', () => {
    it('is admin + isWrite + targetEntityType=Product', () => {
      expect(setOtherVariableTool.requiresAdmin).toBe(true);
      expect(setOtherVariableTool.isWrite).toBe(true);
      expect(setOtherVariableTool.targetEntityType).toBe('Product');
    });

    it('calls upsert with productId + usdPerUserPerMonth', async () => {
      otherVariableSvc.upsert.mockResolvedValue({ id: 'ov1' });
      const out = await setOtherVariableTool.handler(adminCtx, {
        productId: 'p1',
        usdPerUserPerMonth: '5.50',
      });
      expect(otherVariableSvc.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1' }),
      );
      expect(out).toEqual({ productId: 'p1' });
    });
  });

  // ---------------------------------------------------------------------------
  // create_persona
  // ---------------------------------------------------------------------------
  describe('create_persona', () => {
    it('is admin + isWrite + targetEntityType=Persona', () => {
      expect(createPersonaTool.requiresAdmin).toBe(true);
      expect(createPersonaTool.isWrite).toBe(true);
      expect(createPersonaTool.targetEntityType).toBe('Persona');
    });

    it('calls upsert without id and returns {id}', async () => {
      personaSvc.upsert.mockResolvedValue({ id: 'pe1' });
      const out = await createPersonaTool.handler(adminCtx, {
        productId: 'p1',
        name: 'Power User',
        multiplier: '1.5',
        sortOrder: 0,
      });
      expect(personaSvc.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1', name: 'Power User' }),
      );
      expect(out).toEqual({ id: 'pe1' });
    });

    it('rejects missing name', () => {
      expect(() =>
        createPersonaTool.inputSchema.parse({ productId: 'p1', multiplier: '1' }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_persona
  // ---------------------------------------------------------------------------
  describe('update_persona', () => {
    it('is admin + isWrite + targetEntityType=Persona', () => {
      expect(updatePersonaTool.requiresAdmin).toBe(true);
      expect(updatePersonaTool.isWrite).toBe(true);
      expect(updatePersonaTool.targetEntityType).toBe('Persona');
    });

    it('calls upsert with id patch and returns {id}', async () => {
      personaSvc.upsert.mockResolvedValue({ id: 'pe1' });
      const out = await updatePersonaTool.handler(adminCtx, {
        id: 'pe1',
        productId: 'p1',
        name: 'Casual User',
      });
      expect(personaSvc.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pe1', name: 'Casual User' }),
      );
      expect(out).toEqual({ id: 'pe1' });
    });

    it('rejects missing id', () => {
      expect(() => updatePersonaTool.inputSchema.parse({ productId: 'p1', name: 'X' })).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_persona
  // ---------------------------------------------------------------------------
  describe('delete_persona', () => {
    it('is admin + isWrite + targetEntityType=Persona', () => {
      expect(deletePersonaTool.requiresAdmin).toBe(true);
      expect(deletePersonaTool.isWrite).toBe(true);
      expect(deletePersonaTool.targetEntityType).toBe('Persona');
    });

    it('calls delete with id', async () => {
      personaSvc.delete.mockResolvedValue(undefined);
      await deletePersonaTool.handler(adminCtx, { id: 'pe1' });
      expect(personaSvc.delete).toHaveBeenCalledWith('pe1');
    });
  });

  // ---------------------------------------------------------------------------
  // create_fixed_cost
  // ---------------------------------------------------------------------------
  describe('create_fixed_cost', () => {
    it('is admin + isWrite + targetEntityType=ProductFixedCost', () => {
      expect(createFixedCostTool.requiresAdmin).toBe(true);
      expect(createFixedCostTool.isWrite).toBe(true);
      expect(createFixedCostTool.targetEntityType).toBe('ProductFixedCost');
    });

    it('calls upsert without id and returns {id}', async () => {
      fixedCostSvc.upsert.mockResolvedValue({ id: 'fc1' });
      const out = await createFixedCostTool.handler(adminCtx, {
        productId: 'p1',
        name: 'Hosting',
        monthlyUsd: '500',
      });
      expect(fixedCostSvc.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1', name: 'Hosting' }),
      );
      expect(out).toEqual({ id: 'fc1' });
    });

    it('rejects missing monthlyUsd', () => {
      expect(() =>
        createFixedCostTool.inputSchema.parse({ productId: 'p1', name: 'X' }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_fixed_cost
  // ---------------------------------------------------------------------------
  describe('update_fixed_cost', () => {
    it('is admin + isWrite + targetEntityType=ProductFixedCost', () => {
      expect(updateFixedCostTool.requiresAdmin).toBe(true);
      expect(updateFixedCostTool.isWrite).toBe(true);
      expect(updateFixedCostTool.targetEntityType).toBe('ProductFixedCost');
    });

    it('calls upsert with id and returns {id}', async () => {
      fixedCostSvc.upsert.mockResolvedValue({ id: 'fc1' });
      const out = await updateFixedCostTool.handler(adminCtx, {
        id: 'fc1',
        productId: 'p1',
        monthlyUsd: '600',
      });
      expect(fixedCostSvc.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'fc1', productId: 'p1' }),
      );
      expect(out).toEqual({ id: 'fc1' });
    });

    it('rejects missing id', () => {
      expect(() =>
        updateFixedCostTool.inputSchema.parse({ productId: 'p1', monthlyUsd: '100' }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_fixed_cost
  // ---------------------------------------------------------------------------
  describe('delete_fixed_cost', () => {
    it('is admin + isWrite + targetEntityType=ProductFixedCost', () => {
      expect(deleteFixedCostTool.requiresAdmin).toBe(true);
      expect(deleteFixedCostTool.isWrite).toBe(true);
      expect(deleteFixedCostTool.targetEntityType).toBe('ProductFixedCost');
    });

    it('calls delete with id', async () => {
      fixedCostSvc.delete.mockResolvedValue(undefined);
      await deleteFixedCostTool.handler(adminCtx, { id: 'fc1' });
      expect(fixedCostSvc.delete).toHaveBeenCalledWith('fc1');
    });
  });

  // ---------------------------------------------------------------------------
  // set_product_scale
  // ---------------------------------------------------------------------------
  describe('set_product_scale', () => {
    it('is admin + isWrite + targetEntityType=Product', () => {
      expect(setProductScaleTool.requiresAdmin).toBe(true);
      expect(setProductScaleTool.isWrite).toBe(true);
      expect(setProductScaleTool.targetEntityType).toBe('Product');
    });

    it('calls upsert with productId + activeUsersAtScale', async () => {
      productScaleSvc.upsert.mockResolvedValue({ id: 'ps1' });
      const out = await setProductScaleTool.handler(adminCtx, {
        productId: 'p1',
        activeUsersAtScale: 1000,
      });
      expect(productScaleSvc.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1', activeUsersAtScale: 1000 }),
      );
      expect(out).toEqual({ productId: 'p1' });
    });

    it('rejects non-integer activeUsersAtScale', () => {
      expect(() =>
        setProductScaleTool.inputSchema.parse({ productId: 'p1', activeUsersAtScale: 1.5 }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // set_list_price
  // ---------------------------------------------------------------------------
  describe('set_list_price', () => {
    it('is admin + isWrite + targetEntityType=Product', () => {
      expect(setListPriceTool.requiresAdmin).toBe(true);
      expect(setListPriceTool.isWrite).toBe(true);
      expect(setListPriceTool.targetEntityType).toBe('Product');
    });

    it('calls upsert with productId + usdPerSeatPerMonth', async () => {
      listPriceSvc.upsert.mockResolvedValue({ id: 'lp1' });
      const out = await setListPriceTool.handler(adminCtx, {
        productId: 'p1',
        usdPerSeatPerMonth: '99.99',
      });
      expect(listPriceSvc.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1' }),
      );
      expect(out).toEqual({ productId: 'p1' });
    });
  });

  // ---------------------------------------------------------------------------
  // set_volume_tiers
  // ---------------------------------------------------------------------------
  describe('set_volume_tiers', () => {
    it('is admin + isWrite + targetEntityType=Product', () => {
      expect(setVolumeTiersTool.requiresAdmin).toBe(true);
      expect(setVolumeTiersTool.isWrite).toBe(true);
      expect(setVolumeTiersTool.targetEntityType).toBe('Product');
    });

    it('calls setForProduct with full tiers array and returns {productId}', async () => {
      volumeTierSvc.setForProduct.mockResolvedValue(undefined);
      const out = await setVolumeTiersTool.handler(adminCtx, {
        productId: 'p1',
        tiers: [
          { minSeats: 10, discountPct: '0.05' },
          { minSeats: 50, discountPct: '0.10' },
        ],
      });
      const [productId, tiers] = volumeTierSvc.setForProduct.mock.calls[0];
      expect(productId).toBe('p1');
      expect(tiers).toHaveLength(2);
      expect(out).toEqual({ productId: 'p1' });
    });

    it('replacement semantics locked in — passes full tiers array not just delta', async () => {
      volumeTierSvc.setForProduct.mockResolvedValue(undefined);
      await setVolumeTiersTool.handler(adminCtx, {
        productId: 'p1',
        tiers: [
          { minSeats: 1, discountPct: '0.01' },
          { minSeats: 100, discountPct: '0.15' },
          { minSeats: 500, discountPct: '0.20' },
        ],
      });
      const [, tiers] = volumeTierSvc.setForProduct.mock.calls[0];
      expect(tiers).toHaveLength(3);
    });

    it('rejects non-integer minSeats', () => {
      expect(() =>
        setVolumeTiersTool.inputSchema.parse({
          productId: 'p1',
          tiers: [{ minSeats: 1.5, discountPct: '0.05' }],
        }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // set_contract_modifiers
  // ---------------------------------------------------------------------------
  describe('set_contract_modifiers', () => {
    it('is admin + isWrite + targetEntityType=Product', () => {
      expect(setContractModifiersTool.requiresAdmin).toBe(true);
      expect(setContractModifiersTool.isWrite).toBe(true);
      expect(setContractModifiersTool.targetEntityType).toBe('Product');
    });

    it('calls setForProduct with full modifiers array and returns {productId}', async () => {
      contractModSvc.setForProduct.mockResolvedValue(undefined);
      const out = await setContractModifiersTool.handler(adminCtx, {
        productId: 'p1',
        modifiers: [
          { minMonths: 12, additionalDiscountPct: '0.05' },
          { minMonths: 24, additionalDiscountPct: '0.10' },
        ],
      });
      const [productId, mods] = contractModSvc.setForProduct.mock.calls[0];
      expect(productId).toBe('p1');
      expect(mods).toHaveLength(2);
      expect(out).toEqual({ productId: 'p1' });
    });

    it('replacement semantics locked in — passes full modifiers array not just delta', async () => {
      contractModSvc.setForProduct.mockResolvedValue(undefined);
      await setContractModifiersTool.handler(adminCtx, {
        productId: 'p1',
        modifiers: [
          { minMonths: 6, additionalDiscountPct: '0.02' },
          { minMonths: 12, additionalDiscountPct: '0.05' },
          { minMonths: 36, additionalDiscountPct: '0.15' },
        ],
      });
      const [, mods] = contractModSvc.setForProduct.mock.calls[0];
      expect(mods).toHaveLength(3);
    });

    it('rejects non-integer minMonths', () => {
      expect(() =>
        setContractModifiersTool.inputSchema.parse({
          productId: 'p1',
          modifiers: [{ minMonths: 12.5, additionalDiscountPct: '0.05' }],
        }),
      ).toThrow();
    });
  });
});
