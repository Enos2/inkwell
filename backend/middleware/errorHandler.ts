// Project: Inkwell
// Location: backend/middleware/errorHandler.ts
// Purpose: Catches every problem in the Inkwell backend and sends back a clean
// JSON reply. It handles our own AppError, invalid data (zod), broken JSON, a
// request that is too large (413), unknown addresses (404), and unexpected
// crashes (500).

import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
};

// The body reader marks its own problems with a "type" such as
// "entity.parse.failed" or "entity.too.large".
function bodyReaderErrorType(error: unknown): string | null {
  if (error && typeof error === "object") {
    const type = (error as { type?: unknown }).type;
    if (typeof type === "string") return type;
  }
  return null;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Some of the information you sent is not valid",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const bodyErrorType = bodyReaderErrorType(error);

  if (bodyErrorType === "entity.parse.failed") {
    res.status(400).json({ error: "The request body is not valid JSON" });
    return;
  }

  if (bodyErrorType === "entity.too.large") {
    res.status(413).json({ error: "The request is too large" });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Something went wrong on the server" });
};

// Location: backend/middleware/errorHandler.ts
// End of file: errorHandler.ts