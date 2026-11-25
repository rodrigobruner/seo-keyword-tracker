import type { Request, Response, NextFunction } from 'express';

// A thrown HttpError maps to its status; anything else is a generic 500 (no
// stack / SQL detail leaked to the client).
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'not found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'internal server error' });
}
