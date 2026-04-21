import { ZodError } from 'zod';
import { NotFoundError, ValidationError, RailHardBlockError } from '@/lib/utils/errors';

export const McpErrorCode = {
  Unauthorized: -32001,
  Forbidden: -32002,
  RailHardBlock: -32003,
  NotFound: -32004,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export class UnauthorizedError extends Error {
  override readonly name = 'UnauthorizedError';
}

export class ForbiddenError extends Error {
  override readonly name = 'ForbiddenError';
}

export interface McpErrorResponse {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}

export function toMcpError(err: unknown): McpErrorResponse {
  if (err instanceof UnauthorizedError) {
    return { code: McpErrorCode.Unauthorized, message: err.message || 'Unauthorized' };
  }
  if (err instanceof ForbiddenError) {
    return { code: McpErrorCode.Forbidden, message: err.message };
  }
  if (err instanceof NotFoundError) {
    return {
      code: McpErrorCode.NotFound,
      message: `${err.entity} not found: ${err.id}`,
    };
  }
  if (err instanceof ValidationError) {
    return {
      code: McpErrorCode.InvalidParams,
      message: `Invalid: ${err.field}: ${err.reason}`,
    };
  }
  if (err instanceof RailHardBlockError) {
    return {
      code: McpErrorCode.RailHardBlock,
      message: `Rail hard-block: ${err.railKey}; measured ${err.measured} vs threshold ${err.threshold}`,
      data: { railKey: err.railKey, measured: err.measured, threshold: err.threshold },
    };
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return {
      code: McpErrorCode.InvalidParams,
      message: `Invalid params: ${first?.path.join('.') || '<root>'}: ${first?.message || 'validation failed'}`,
    };
  }
  return { code: McpErrorCode.InternalError, message: 'Internal error' };
}
