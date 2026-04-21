import { describe, it, expect } from 'vitest';
import { NotFoundError, ValidationError, RailHardBlockError } from '@/lib/utils/errors';
import { ZodError, z } from 'zod';
import { toMcpError, McpErrorCode } from './errors';

describe('toMcpError', () => {
  it('maps UnauthorizedError', () => {
    const err = toMcpError(new Error('missing bearer'));
    // Plain Error with no typed class falls through to Internal
    expect(err.code).toBe(McpErrorCode.InternalError);
  });

  it('maps NotFoundError to -32004', () => {
    const out = toMcpError(new NotFoundError('Scenario', 's1'));
    expect(out.code).toBe(McpErrorCode.NotFound);
    expect(out.message).toContain('Scenario not found: s1');
  });

  it('maps ValidationError to -32602 with field', () => {
    const out = toMcpError(new ValidationError('seatCount', 'must be positive'));
    expect(out.code).toBe(McpErrorCode.InvalidParams);
    expect(out.message).toContain('seatCount');
  });

  it('maps RailHardBlockError to -32003 with measured/threshold', () => {
    const out = toMcpError(new RailHardBlockError('MIN_MARGIN_PCT', 0.1, 0.15));
    expect(out.code).toBe(McpErrorCode.RailHardBlock);
    expect(out.message).toContain('MIN_MARGIN_PCT');
    expect(out.data).toMatchObject({ measured: 0.1, threshold: 0.15 });
  });

  it('maps ZodError to -32602 Invalid params', () => {
    let zErr: ZodError;
    try {
      z.object({ n: z.number() }).parse({ n: 'x' });
      throw new Error('unreachable');
    } catch (e) {
      zErr = e as ZodError;
    }
    const out = toMcpError(zErr!);
    expect(out.code).toBe(McpErrorCode.InvalidParams);
  });

  it('maps unknown errors to -32603 Internal', () => {
    const out = toMcpError(new TypeError('boom'));
    expect(out.code).toBe(McpErrorCode.InternalError);
    expect(out.message).toBe('Internal error');
  });
});

describe('UnauthorizedError and ForbiddenError (from this module)', () => {
  it('map to -32001 and -32002', async () => {
    const { UnauthorizedError, ForbiddenError } = await import('./errors');
    expect(toMcpError(new UnauthorizedError()).code).toBe(McpErrorCode.Unauthorized);
    expect(toMcpError(new ForbiddenError('admin required')).code).toBe(McpErrorCode.Forbidden);
  });
});
