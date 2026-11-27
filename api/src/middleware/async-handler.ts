import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 does not forward a rejected promise from an async handler to the
// error middleware: the rejection goes unhandled, the request hangs forever, and
// the process can crash. Wrapping an async handler routes its rejection to
// `next`, so it reaches `errorHandler` and returns a clean 500.
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
