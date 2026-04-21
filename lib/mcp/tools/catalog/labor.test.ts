import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));

vi.mock('@/lib/services/laborSku', () => ({
  LaborSKUService: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.update = vi.fn();
    this.delete = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/department', () => ({
  DepartmentService: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.update = vi.fn();
    this.delete = vi.fn();
    this.setBillRate = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/employee', () => ({
  EmployeeService: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.update = vi.fn();
    this.delete = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/burden', () => ({
  BurdenService: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.update = vi.fn();
    this.delete = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/db/repositories/laborSku', () => ({ LaborSKURepository: vi.fn() }));
vi.mock('@/lib/db/repositories/department', () => ({ DepartmentRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/employee', () => ({ EmployeeRepository: vi.fn() }));
vi.mock('@/lib/db/repositories/burden', () => ({ BurdenRepository: vi.fn() }));

import { LaborSKUService } from '@/lib/services/laborSku';
import { DepartmentService } from '@/lib/services/department';
import { EmployeeService } from '@/lib/services/employee';
import { BurdenService } from '@/lib/services/burden';

import {
  createLaborSkuTool,
  updateLaborSkuTool,
  deleteLaborSkuTool,
  createDepartmentTool,
  updateDepartmentTool,
  deleteDepartmentTool,
  setDepartmentBillRateTool,
  createEmployeeTool,
  updateEmployeeTool,
  deleteEmployeeTool,
  createBurdenTool,
  updateBurdenTool,
  deleteBurdenTool,
  laborTools,
} from './labor';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

function getSvc<T>(MockClass: any): T {
  return new MockClass() as T;
}

describe('labor catalog tools', () => {
  let laborSkuSvc: any;
  let departmentSvc: any;
  let employeeSvc: any;
  let burdenSvc: any;

  beforeEach(() => {
    vi.clearAllMocks();

    laborSkuSvc = getSvc(LaborSKUService);
    departmentSvc = getSvc(DepartmentService);
    employeeSvc = getSvc(EmployeeService);
    burdenSvc = getSvc(BurdenService);

    (LaborSKUService as any).mockImplementation(function (this: any) {
      Object.assign(this, laborSkuSvc);
      return this;
    });
    (DepartmentService as any).mockImplementation(function (this: any) {
      Object.assign(this, departmentSvc);
      return this;
    });
    (EmployeeService as any).mockImplementation(function (this: any) {
      Object.assign(this, employeeSvc);
      return this;
    });
    (BurdenService as any).mockImplementation(function (this: any) {
      Object.assign(this, burdenSvc);
      return this;
    });
  });

  it('exports 13 tools in laborTools array', () => {
    expect(laborTools).toHaveLength(13);
  });

  // ---------------------------------------------------------------------------
  // create_labor_sku
  // ---------------------------------------------------------------------------
  describe('create_labor_sku', () => {
    it('is admin + isWrite + targetEntityType=LaborSKU', () => {
      expect(createLaborSkuTool.requiresAdmin).toBe(true);
      expect(createLaborSkuTool.isWrite).toBe(true);
      expect(createLaborSkuTool.targetEntityType).toBe('LaborSKU');
    });

    it('calls service.create and returns {id}', async () => {
      laborSkuSvc.create.mockResolvedValue({ id: 'sku1' });
      const out = await createLaborSkuTool.handler(adminCtx, {
        productId: 'p1',
        name: 'Implementation Day',
        unit: 'PER_DAY',
        costPerUnitUsd: '800',
        defaultRevenueUsd: '1200',
      });
      expect(laborSkuSvc.create).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1', name: 'Implementation Day', unit: 'PER_DAY' }),
      );
      expect(out).toEqual({ id: 'sku1' });
    });

    it('rejects invalid unit enum', () => {
      expect(() =>
        createLaborSkuTool.inputSchema.parse({
          productId: 'p1',
          name: 'X',
          unit: 'INVALID',
          costPerUnitUsd: '100',
          defaultRevenueUsd: '150',
        }),
      ).toThrow();
    });

    it('rejects missing productId', () => {
      expect(() =>
        createLaborSkuTool.inputSchema.parse({
          name: 'X',
          unit: 'FIXED',
          costPerUnitUsd: '100',
          defaultRevenueUsd: '150',
        }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_labor_sku
  // ---------------------------------------------------------------------------
  describe('update_labor_sku', () => {
    it('is admin + isWrite + targetEntityType=LaborSKU', () => {
      expect(updateLaborSkuTool.requiresAdmin).toBe(true);
      expect(updateLaborSkuTool.isWrite).toBe(true);
      expect(updateLaborSkuTool.targetEntityType).toBe('LaborSKU');
    });

    it('calls service.update with id and patch, returns {id}', async () => {
      laborSkuSvc.update.mockResolvedValue({ id: 'sku1' });
      const out = await updateLaborSkuTool.handler(adminCtx, {
        id: 'sku1',
        name: 'Renamed SKU',
        costPerUnitUsd: '900',
      });
      expect(laborSkuSvc.update).toHaveBeenCalledWith(
        'sku1',
        expect.objectContaining({ name: 'Renamed SKU' }),
      );
      expect(out).toEqual({ id: 'sku1' });
    });

    it('rejects missing id', () => {
      expect(() => updateLaborSkuTool.inputSchema.parse({ name: 'X' })).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_labor_sku
  // ---------------------------------------------------------------------------
  describe('delete_labor_sku', () => {
    it('is admin + isWrite + targetEntityType=LaborSKU', () => {
      expect(deleteLaborSkuTool.requiresAdmin).toBe(true);
      expect(deleteLaborSkuTool.isWrite).toBe(true);
      expect(deleteLaborSkuTool.targetEntityType).toBe('LaborSKU');
    });

    it('calls service.delete with id and returns {id}', async () => {
      laborSkuSvc.delete.mockResolvedValue(undefined);
      const out = await deleteLaborSkuTool.handler(adminCtx, { id: 'sku1' });
      expect(laborSkuSvc.delete).toHaveBeenCalledWith('sku1');
      expect(out).toEqual({ id: 'sku1' });
    });
  });

  // ---------------------------------------------------------------------------
  // create_department
  // ---------------------------------------------------------------------------
  describe('create_department', () => {
    it('is admin + isWrite + targetEntityType=Department', () => {
      expect(createDepartmentTool.requiresAdmin).toBe(true);
      expect(createDepartmentTool.isWrite).toBe(true);
      expect(createDepartmentTool.targetEntityType).toBe('Department');
    });

    it('calls service.create and returns {id}', async () => {
      departmentSvc.create.mockResolvedValue({ id: 'dept1' });
      const out = await createDepartmentTool.handler(adminCtx, { name: 'Engineering' });
      expect(departmentSvc.create).toHaveBeenCalledWith({ name: 'Engineering' });
      expect(out).toEqual({ id: 'dept1' });
    });

    it('rejects missing name', () => {
      expect(() => createDepartmentTool.inputSchema.parse({})).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_department
  // ---------------------------------------------------------------------------
  describe('update_department', () => {
    it('is admin + isWrite + targetEntityType=Department', () => {
      expect(updateDepartmentTool.requiresAdmin).toBe(true);
      expect(updateDepartmentTool.isWrite).toBe(true);
      expect(updateDepartmentTool.targetEntityType).toBe('Department');
    });

    it('calls service.update with id and patch, returns {id}', async () => {
      departmentSvc.update.mockResolvedValue({ id: 'dept1' });
      const out = await updateDepartmentTool.handler(adminCtx, { id: 'dept1', name: 'Design' });
      expect(departmentSvc.update).toHaveBeenCalledWith('dept1', { name: 'Design' });
      expect(out).toEqual({ id: 'dept1' });
    });

    it('rejects missing id', () => {
      expect(() => updateDepartmentTool.inputSchema.parse({ name: 'X' })).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_department
  // ---------------------------------------------------------------------------
  describe('delete_department', () => {
    it('is admin + isWrite + targetEntityType=Department', () => {
      expect(deleteDepartmentTool.requiresAdmin).toBe(true);
      expect(deleteDepartmentTool.isWrite).toBe(true);
      expect(deleteDepartmentTool.targetEntityType).toBe('Department');
    });

    it('calls service.delete with id and returns {id}', async () => {
      departmentSvc.delete.mockResolvedValue(undefined);
      const out = await deleteDepartmentTool.handler(adminCtx, { id: 'dept1' });
      expect(departmentSvc.delete).toHaveBeenCalledWith('dept1');
      expect(out).toEqual({ id: 'dept1' });
    });
  });

  // ---------------------------------------------------------------------------
  // set_department_bill_rate
  // ---------------------------------------------------------------------------
  describe('set_department_bill_rate', () => {
    it('is admin + isWrite + targetEntityType=Department', () => {
      expect(setDepartmentBillRateTool.requiresAdmin).toBe(true);
      expect(setDepartmentBillRateTool.isWrite).toBe(true);
      expect(setDepartmentBillRateTool.targetEntityType).toBe('Department');
    });

    it('calls service.setBillRate and returns {departmentId}', async () => {
      departmentSvc.setBillRate.mockResolvedValue({ departmentId: 'dept1' });
      const out = await setDepartmentBillRateTool.handler(adminCtx, {
        departmentId: 'dept1',
        billRatePerHour: '150',
      });
      expect(departmentSvc.setBillRate).toHaveBeenCalledWith('dept1', expect.anything());
      expect(out).toEqual({ departmentId: 'dept1' });
    });

    it('rejects missing departmentId', () => {
      expect(() =>
        setDepartmentBillRateTool.inputSchema.parse({ billRatePerHour: '100' }),
      ).toThrow();
    });

    it('rejects missing billRatePerHour', () => {
      expect(() =>
        setDepartmentBillRateTool.inputSchema.parse({ departmentId: 'dept1' }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // create_employee
  // ---------------------------------------------------------------------------
  describe('create_employee', () => {
    it('is admin + isWrite + targetEntityType=Employee', () => {
      expect(createEmployeeTool.requiresAdmin).toBe(true);
      expect(createEmployeeTool.isWrite).toBe(true);
      expect(createEmployeeTool.targetEntityType).toBe('Employee');
    });

    it('calls service.create with ANNUAL_SALARY employee data and returns {id}', async () => {
      employeeSvc.create.mockResolvedValue({ id: 'emp1' });
      const out = await createEmployeeTool.handler(adminCtx, {
        name: 'Alice',
        departmentId: 'dept1',
        compensationType: 'ANNUAL_SALARY',
        annualSalaryUsd: '120000',
        standardHoursPerYear: 2080,
      });
      expect(employeeSvc.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Alice',
          departmentId: 'dept1',
          compensationType: 'ANNUAL_SALARY',
        }),
      );
      expect(out).toEqual({ id: 'emp1' });
    });

    it('calls service.create with HOURLY employee data', async () => {
      employeeSvc.create.mockResolvedValue({ id: 'emp2' });
      const out = await createEmployeeTool.handler(adminCtx, {
        name: 'Bob',
        departmentId: 'dept1',
        compensationType: 'HOURLY',
        hourlyRateUsd: '75',
        standardHoursPerYear: 1920,
      });
      expect(employeeSvc.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Bob', compensationType: 'HOURLY' }),
      );
      expect(out).toEqual({ id: 'emp2' });
    });

    it('rejects invalid compensationType', () => {
      expect(() =>
        createEmployeeTool.inputSchema.parse({
          name: 'X',
          departmentId: 'd1',
          compensationType: 'INVALID',
        }),
      ).toThrow();
    });

    it('rejects missing name', () => {
      expect(() =>
        createEmployeeTool.inputSchema.parse({
          departmentId: 'd1',
          compensationType: 'HOURLY',
        }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_employee
  // ---------------------------------------------------------------------------
  describe('update_employee', () => {
    it('is admin + isWrite + targetEntityType=Employee', () => {
      expect(updateEmployeeTool.requiresAdmin).toBe(true);
      expect(updateEmployeeTool.isWrite).toBe(true);
      expect(updateEmployeeTool.targetEntityType).toBe('Employee');
    });

    it('calls service.update with id and patch, returns {id}', async () => {
      employeeSvc.update.mockResolvedValue({ id: 'emp1' });
      const out = await updateEmployeeTool.handler(adminCtx, {
        id: 'emp1',
        name: 'Alice Renamed',
        isActive: false,
      });
      expect(employeeSvc.update).toHaveBeenCalledWith(
        'emp1',
        expect.objectContaining({ name: 'Alice Renamed', isActive: false }),
      );
      expect(out).toEqual({ id: 'emp1' });
    });

    it('rejects missing id', () => {
      expect(() => updateEmployeeTool.inputSchema.parse({ name: 'X' })).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_employee
  // ---------------------------------------------------------------------------
  describe('delete_employee', () => {
    it('is admin + isWrite + targetEntityType=Employee', () => {
      expect(deleteEmployeeTool.requiresAdmin).toBe(true);
      expect(deleteEmployeeTool.isWrite).toBe(true);
      expect(deleteEmployeeTool.targetEntityType).toBe('Employee');
    });

    it('calls service.delete with id and returns {id}', async () => {
      employeeSvc.delete.mockResolvedValue(undefined);
      const out = await deleteEmployeeTool.handler(adminCtx, { id: 'emp1' });
      expect(employeeSvc.delete).toHaveBeenCalledWith('emp1');
      expect(out).toEqual({ id: 'emp1' });
    });
  });

  // ---------------------------------------------------------------------------
  // create_burden
  // ---------------------------------------------------------------------------
  describe('create_burden', () => {
    it('is admin + isWrite + targetEntityType=Burden', () => {
      expect(createBurdenTool.requiresAdmin).toBe(true);
      expect(createBurdenTool.isWrite).toBe(true);
      expect(createBurdenTool.targetEntityType).toBe('Burden');
    });

    it('calls service.create with ALL_DEPARTMENTS burden and returns {id}', async () => {
      burdenSvc.create.mockResolvedValue({ id: 'bur1' });
      const out = await createBurdenTool.handler(adminCtx, {
        name: 'FICA',
        ratePct: '0.0765',
        scope: 'ALL_DEPARTMENTS',
      });
      expect(burdenSvc.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'FICA', scope: 'ALL_DEPARTMENTS' }),
      );
      expect(out).toEqual({ id: 'bur1' });
    });

    it('calls service.create with DEPARTMENT-scoped burden', async () => {
      burdenSvc.create.mockResolvedValue({ id: 'bur2' });
      const out = await createBurdenTool.handler(adminCtx, {
        name: 'Dept Health',
        ratePct: '0.05',
        scope: 'DEPARTMENT',
        departmentId: 'dept1',
      });
      expect(burdenSvc.create).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'DEPARTMENT', departmentId: 'dept1' }),
      );
      expect(out).toEqual({ id: 'bur2' });
    });

    it('rejects invalid scope', () => {
      expect(() =>
        createBurdenTool.inputSchema.parse({ name: 'X', ratePct: '0.1', scope: 'INVALID' }),
      ).toThrow();
    });

    it('rejects missing name', () => {
      expect(() =>
        createBurdenTool.inputSchema.parse({ ratePct: '0.1', scope: 'ALL_DEPARTMENTS' }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_burden
  // ---------------------------------------------------------------------------
  describe('update_burden', () => {
    it('is admin + isWrite + targetEntityType=Burden', () => {
      expect(updateBurdenTool.requiresAdmin).toBe(true);
      expect(updateBurdenTool.isWrite).toBe(true);
      expect(updateBurdenTool.targetEntityType).toBe('Burden');
    });

    it('calls service.update with id and patch, returns {id}', async () => {
      burdenSvc.update.mockResolvedValue({ id: 'bur1' });
      const out = await updateBurdenTool.handler(adminCtx, {
        id: 'bur1',
        ratePct: '0.08',
        isActive: false,
      });
      expect(burdenSvc.update).toHaveBeenCalledWith(
        'bur1',
        expect.objectContaining({ isActive: false }),
      );
      expect(out).toEqual({ id: 'bur1' });
    });

    it('rejects missing id', () => {
      expect(() => updateBurdenTool.inputSchema.parse({ name: 'X' })).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_burden
  // ---------------------------------------------------------------------------
  describe('delete_burden', () => {
    it('is admin + isWrite + targetEntityType=Burden', () => {
      expect(deleteBurdenTool.requiresAdmin).toBe(true);
      expect(deleteBurdenTool.isWrite).toBe(true);
      expect(deleteBurdenTool.targetEntityType).toBe('Burden');
    });

    it('calls service.delete with id and returns {id}', async () => {
      burdenSvc.delete.mockResolvedValue(undefined);
      const out = await deleteBurdenTool.handler(adminCtx, { id: 'bur1' });
      expect(burdenSvc.delete).toHaveBeenCalledWith('bur1');
      expect(out).toEqual({ id: 'bur1' });
    });
  });
});
