import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import { listEmployees, getEmployeeById } from '@/lib/services/employee';
import { listDepartmentsWithLoadedRate } from '@/lib/services/department';
import { listBurdens } from '@/lib/services/burden';
import { listCommissionRules, getCommissionRuleById } from '@/lib/services/commissionRule';
import { listAllApiTokens } from '@/lib/services/apiToken';

const empty = z.object({}).strict();

export const listEmployeesTool: ToolDefinition = {
  name: 'list_employees',
  description:
    'Admin only. Lists all active employees with compensation details, department, and active flag.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listEmployees(),
};

export const getEmployeeTool: ToolDefinition<{ id: string }, unknown> = {
  name: 'get_employee',
  description: 'Admin only. Full employee row by id. Throws if not found.',
  inputSchema: z.object({ id: z.string() }).strict(),
  requiresAdmin: true,
  handler: async (_ctx, { id }) => getEmployeeById(id),
};

export const listDepartmentsTool: ToolDefinition = {
  name: 'list_departments',
  description:
    'Admin only. Departments with computed loaded hourly rate (first employee representative) and admin-set bill rate.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listDepartmentsWithLoadedRate(),
};

export const listBurdensTool: ToolDefinition = {
  name: 'list_burdens',
  description:
    'Admin only. All active burden rates (FICA, FUTA, SUTA, etc.) with caps and scope.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listBurdens(),
};

export const listCommissionRulesTool: ToolDefinition = {
  name: 'list_commission_rules',
  description: 'Admin only. All active commission rules with tiers and scope.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listCommissionRules(),
};

export const getCommissionRuleTool: ToolDefinition<{ id: string }, unknown> = {
  name: 'get_commission_rule',
  description: 'Admin only. Commission rule detail with full tier breakdown. Throws if not found.',
  inputSchema: z.object({ id: z.string() }).strict(),
  requiresAdmin: true,
  handler: async (_ctx, { id }) => getCommissionRuleById(id),
};

export const listApiTokensTool: ToolDefinition = {
  name: 'list_api_tokens',
  description:
    'Admin only. All API tokens across the org (including owner info). Use for audit and kill-switch.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listAllApiTokens(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const adminReadTools: ToolDefinition<any, any>[] = [
  listEmployeesTool,
  getEmployeeTool,
  listDepartmentsTool,
  listBurdensTool,
  listCommissionRulesTool,
  getCommissionRuleTool,
  listApiTokensTool,
];
