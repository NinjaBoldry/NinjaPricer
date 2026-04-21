import { z } from 'zod';
import Decimal from 'decimal.js';
import { LaborSKUUnit, EmployeeCompensationType, BurdenScope } from '@prisma/client';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { LaborSKUService } from '@/lib/services/laborSku';
import { DepartmentService } from '@/lib/services/department';
import { EmployeeService } from '@/lib/services/employee';
import { BurdenService } from '@/lib/services/burden';
import { LaborSKURepository } from '@/lib/db/repositories/laborSku';
import { DepartmentRepository } from '@/lib/db/repositories/department';
import { EmployeeRepository } from '@/lib/db/repositories/employee';
import { BurdenRepository } from '@/lib/db/repositories/burden';

// ---------------------------------------------------------------------------
// create_labor_sku
// ---------------------------------------------------------------------------

const createLaborSkuSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1),
    unit: z.nativeEnum(LaborSKUUnit),
    costPerUnitUsd: z.union([z.string(), z.number()]),
    defaultRevenueUsd: z.union([z.string(), z.number()]),
  })
  .strict();

export const createLaborSkuTool: ToolDefinition<
  z.infer<typeof createLaborSkuSchema>,
  { id: string }
> = {
  name: 'create_labor_sku',
  description:
    'Admin only. Creates a new labor SKU for a product (name, unit: PER_USER | PER_SESSION | PER_DAY | FIXED, costPerUnitUsd, defaultRevenueUsd). Returns the new row id.',
  inputSchema: createLaborSkuSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'LaborSKU',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new LaborSKUService(new LaborSKURepository(prisma));
    const row = await svc.create({
      productId: input.productId,
      name: input.name,
      unit: input.unit,
      costPerUnitUsd: new Decimal(input.costPerUnitUsd),
      defaultRevenueUsd: new Decimal(input.defaultRevenueUsd),
    });
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_labor_sku
// ---------------------------------------------------------------------------

const updateLaborSkuSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    unit: z.nativeEnum(LaborSKUUnit).optional(),
    costPerUnitUsd: z.union([z.string(), z.number()]).optional(),
    defaultRevenueUsd: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export const updateLaborSkuTool: ToolDefinition<
  z.infer<typeof updateLaborSkuSchema>,
  { id: string }
> = {
  name: 'update_labor_sku',
  description:
    'Admin only. Updates an existing labor SKU (name, unit, costPerUnitUsd, defaultRevenueUsd). Requires id.',
  inputSchema: updateLaborSkuSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'LaborSKU',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id, costPerUnitUsd, defaultRevenueUsd, ...rest }) => {
    const svc = new LaborSKUService(new LaborSKURepository(prisma));
    const patch: Record<string, unknown> = { ...rest };
    if (costPerUnitUsd !== undefined) patch.costPerUnitUsd = new Decimal(costPerUnitUsd);
    if (defaultRevenueUsd !== undefined) patch.defaultRevenueUsd = new Decimal(defaultRevenueUsd);
    await svc.update(id, patch);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// delete_labor_sku
// ---------------------------------------------------------------------------

const deleteLaborSkuSchema = z.object({ id: z.string().min(1) }).strict();

export const deleteLaborSkuTool: ToolDefinition<
  z.infer<typeof deleteLaborSkuSchema>,
  { id: string }
> = {
  name: 'delete_labor_sku',
  description:
    'Admin only. Hard-deletes a labor SKU by id. FAILS if any scenario references this SKU (Prisma onDelete: Restrict).',
  inputSchema: deleteLaborSkuSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'LaborSKU',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new LaborSKUService(new LaborSKURepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// create_department
// ---------------------------------------------------------------------------

const createDepartmentSchema = z.object({ name: z.string().min(1) }).strict();

export const createDepartmentTool: ToolDefinition<
  z.infer<typeof createDepartmentSchema>,
  { id: string }
> = {
  name: 'create_department',
  description:
    'Admin only. Creates a new department (name). Bill rate is set separately via set_department_bill_rate.',
  inputSchema: createDepartmentSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Department',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new DepartmentService(new DepartmentRepository(prisma));
    const row = await svc.create(input);
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_department
// ---------------------------------------------------------------------------

const updateDepartmentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
  })
  .strict();

export const updateDepartmentTool: ToolDefinition<
  z.infer<typeof updateDepartmentSchema>,
  { id: string }
> = {
  name: 'update_department',
  description: 'Admin only. Updates a department name by id.',
  inputSchema: updateDepartmentSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Department',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id, ...patch }) => {
    const svc = new DepartmentService(new DepartmentRepository(prisma));
    await svc.update(id, patch);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// delete_department
// ---------------------------------------------------------------------------

const deleteDepartmentSchema = z.object({ id: z.string().min(1) }).strict();

export const deleteDepartmentTool: ToolDefinition<
  z.infer<typeof deleteDepartmentSchema>,
  { id: string }
> = {
  name: 'delete_department',
  description:
    'Admin only. Hard-deletes a department by id. FAILS if employees or scenarios reference it (Prisma onDelete: Restrict).',
  inputSchema: deleteDepartmentSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Department',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new DepartmentService(new DepartmentRepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// set_department_bill_rate
// ---------------------------------------------------------------------------

const setDepartmentBillRateSchema = z
  .object({
    departmentId: z.string().min(1),
    billRatePerHour: z.union([z.string(), z.number()]),
  })
  .strict();

export const setDepartmentBillRateTool: ToolDefinition<
  z.infer<typeof setDepartmentBillRateSchema>,
  { departmentId: string }
> = {
  name: 'set_department_bill_rate',
  description:
    'Admin only. Sets (upserts) the bill rate per hour for a department. billRatePerHour must be > 0.',
  inputSchema: setDepartmentBillRateSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Department',
  extractTargetId: (input) => (input as { departmentId: string }).departmentId,
  handler: async (_ctx, { departmentId, billRatePerHour }) => {
    const svc = new DepartmentService(new DepartmentRepository(prisma));
    await svc.setBillRate(departmentId, new Decimal(billRatePerHour));
    return { departmentId };
  },
};

// ---------------------------------------------------------------------------
// create_employee
// ---------------------------------------------------------------------------

const createEmployeeSchema = z
  .object({
    name: z.string().min(1),
    departmentId: z.string().min(1),
    compensationType: z.nativeEnum(EmployeeCompensationType),
    annualSalaryUsd: z.union([z.string(), z.number()]).optional(),
    hourlyRateUsd: z.union([z.string(), z.number()]).optional(),
    standardHoursPerYear: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const createEmployeeTool: ToolDefinition<
  z.infer<typeof createEmployeeSchema>,
  { id: string }
> = {
  name: 'create_employee',
  description:
    'Admin only. Creates an employee in a department. compensationType: ANNUAL_SALARY | HOURLY. For ANNUAL_SALARY, provide annualSalaryUsd + standardHoursPerYear. For HOURLY, provide hourlyRateUsd + standardHoursPerYear. Both fields are required by the respective compensation type.',
  inputSchema: createEmployeeSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Employee',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new EmployeeService(new EmployeeRepository(prisma));
    const payload: Record<string, unknown> = {
      name: input.name,
      departmentId: input.departmentId,
      compensationType: input.compensationType,
    };
    if (input.annualSalaryUsd !== undefined)
      payload.annualSalaryUsd = new Decimal(input.annualSalaryUsd);
    if (input.hourlyRateUsd !== undefined) payload.hourlyRateUsd = new Decimal(input.hourlyRateUsd);
    if (input.standardHoursPerYear !== undefined)
      payload.standardHoursPerYear = input.standardHoursPerYear;
    if (input.isActive !== undefined) payload.isActive = input.isActive;
    const row = await svc.create(payload);
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_employee
// ---------------------------------------------------------------------------

const updateEmployeeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    annualSalaryUsd: z.union([z.string(), z.number()]).optional(),
    hourlyRateUsd: z.union([z.string(), z.number()]).optional(),
    standardHoursPerYear: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateEmployeeTool: ToolDefinition<
  z.infer<typeof updateEmployeeSchema>,
  { id: string }
> = {
  name: 'update_employee',
  description:
    'Admin only. Updates an employee record (name, annualSalaryUsd, hourlyRateUsd, standardHoursPerYear, isActive). Requires id.',
  inputSchema: updateEmployeeSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Employee',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id, annualSalaryUsd, hourlyRateUsd, ...rest }) => {
    const svc = new EmployeeService(new EmployeeRepository(prisma));
    const patch: Record<string, unknown> = { ...rest };
    if (annualSalaryUsd !== undefined) patch.annualSalaryUsd = new Decimal(annualSalaryUsd);
    if (hourlyRateUsd !== undefined) patch.hourlyRateUsd = new Decimal(hourlyRateUsd);
    await svc.update(id, patch);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// delete_employee
// ---------------------------------------------------------------------------

const deleteEmployeeSchema = z.object({ id: z.string().min(1) }).strict();

export const deleteEmployeeTool: ToolDefinition<
  z.infer<typeof deleteEmployeeSchema>,
  { id: string }
> = {
  name: 'delete_employee',
  description:
    'Admin only. Hard-deletes an employee by id. Prefer isActive=false via update_employee to preserve history.',
  inputSchema: deleteEmployeeSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Employee',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new EmployeeService(new EmployeeRepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// create_burden
// ---------------------------------------------------------------------------

const createBurdenSchema = z
  .object({
    name: z.string().min(1),
    ratePct: z.union([z.string(), z.number()]),
    capUsd: z.union([z.string(), z.number()]).optional(),
    scope: z.nativeEnum(BurdenScope),
    departmentId: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const createBurdenTool: ToolDefinition<
  z.infer<typeof createBurdenSchema>,
  { id: string }
> = {
  name: 'create_burden',
  description:
    'Admin only. Creates a burden rate (e.g. FICA, health insurance). scope: ALL_DEPARTMENTS | DEPARTMENT. When scope is DEPARTMENT, departmentId is required. ratePct is a fraction (e.g. 0.0765 for 7.65%). capUsd is an optional annual cap.',
  inputSchema: createBurdenSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Burden',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new BurdenService(new BurdenRepository(prisma));
    const payload: Record<string, unknown> = {
      name: input.name,
      ratePct: new Decimal(input.ratePct),
      scope: input.scope,
    };
    if (input.capUsd !== undefined) payload.capUsd = new Decimal(input.capUsd);
    if (input.departmentId !== undefined) payload.departmentId = input.departmentId;
    if (input.isActive !== undefined) payload.isActive = input.isActive;
    const row = await svc.create(payload);
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_burden
// ---------------------------------------------------------------------------

const updateBurdenSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    ratePct: z.union([z.string(), z.number()]).optional(),
    capUsd: z.union([z.string(), z.number()]).nullable().optional(),
    scope: z.nativeEnum(BurdenScope).optional(),
    departmentId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateBurdenTool: ToolDefinition<
  z.infer<typeof updateBurdenSchema>,
  { id: string }
> = {
  name: 'update_burden',
  description:
    'Admin only. Updates a burden rate (name, ratePct, capUsd, scope, departmentId, isActive). Requires id. Pass null for capUsd to remove the cap.',
  inputSchema: updateBurdenSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Burden',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id, ratePct, capUsd, ...rest }) => {
    const svc = new BurdenService(new BurdenRepository(prisma));
    const patch: Record<string, unknown> = { ...rest };
    if (ratePct !== undefined) patch.ratePct = new Decimal(ratePct);
    if (capUsd !== undefined) patch.capUsd = capUsd === null ? null : new Decimal(capUsd);
    await svc.update(id, patch);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// delete_burden
// ---------------------------------------------------------------------------

const deleteBurdenSchema = z.object({ id: z.string().min(1) }).strict();

export const deleteBurdenTool: ToolDefinition<
  z.infer<typeof deleteBurdenSchema>,
  { id: string }
> = {
  name: 'delete_burden',
  description: 'Admin only. Hard-deletes a burden rate by id.',
  inputSchema: deleteBurdenSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Burden',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new BurdenService(new BurdenRepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const laborTools: ToolDefinition<any, any>[] = [
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
];
