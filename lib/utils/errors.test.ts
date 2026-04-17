import { describe, it, expect } from 'vitest';
import { NotFoundError, ValidationError, RailHardBlockError, isAppError } from './errors';

describe('errors', () => {
  it('NotFoundError has correct name and message', () => {
    const err = new NotFoundError('Product', 'abc123');
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('Product not found: abc123');
    expect(err.entity).toBe('Product');
    expect(err.id).toBe('abc123');
  });

  it('ValidationError carries field and reason', () => {
    const err = new ValidationError('seat_count', 'must be >= 0');
    expect(err.name).toBe('ValidationError');
    expect(err.field).toBe('seat_count');
    expect(err.reason).toBe('must be >= 0');
  });

  it('RailHardBlockError carries rail metadata', () => {
    const err = new RailHardBlockError('min_margin', 0.45, 0.5);
    expect(err.name).toBe('RailHardBlockError');
    expect(err.railKey).toBe('min_margin');
    expect(err.measured).toBe(0.45);
    expect(err.threshold).toBe(0.5);
  });

  it('isAppError identifies our error types', () => {
    expect(isAppError(new NotFoundError('X', 'y'))).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
  });
});
