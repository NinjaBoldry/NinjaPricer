export abstract class AppError extends Error {
  abstract override readonly name: string;
}

export class NotFoundError extends AppError {
  override readonly name = 'NotFoundError';
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} not found: ${id}`);
  }
}

export class ValidationError extends AppError {
  override readonly name = 'ValidationError';
  constructor(
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`${field}: ${reason}`);
  }
}

export class RailHardBlockError extends AppError {
  override readonly name = 'RailHardBlockError';
  constructor(
    public readonly railKey: string,
    public readonly measured: number,
    public readonly threshold: number,
  ) {
    super(`Rail hard block on ${railKey}: measured ${measured} vs threshold ${threshold}`);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
