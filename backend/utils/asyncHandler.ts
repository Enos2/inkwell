// Location: backend/utils/asyncHandler.ts
// Purpose: Wraps a route function so that any error it throws is passed to the
// error handler instead of crashing the request.

import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// Location: backend/utils/asyncHandler.ts
// End of file: asyncHandler.ts