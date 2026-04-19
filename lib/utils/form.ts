import Decimal from 'decimal.js';
import { ValidationError } from './errors';

export function parseDecimalField(fieldName: string, raw: string | null, fallback = '0'): Decimal {
  try {
    return new Decimal(raw?.trim() || fallback);
  } catch {
    throw new ValidationError(fieldName, 'must be a valid number');
  }
}
