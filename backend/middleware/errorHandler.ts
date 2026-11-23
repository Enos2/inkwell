// Location: backend/middleware/errorHandler.ts
// Purpose: Catches every problem in the backend and sends back a clean JSON
// reply. It handles our own AppError, invalid data (zod), broken JSON, unknown
// addresses (404), and unexpected crashes (500).

import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
};

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

  if (
    error &&
    typeof error === "object" &&
    (error as { type?: string }).type === "entity.parse.failed"
  ) {
    res.status(400).json({ error: "The request body is not valid JSON" });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Something went wrong on the server" });
};

// Location: backend/middleware/errorHandler.ts
// End of file: errorHandler.ts