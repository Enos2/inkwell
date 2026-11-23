// Location: backend/routes/health.routes.ts
// Purpose: A simple address, GET /api/health, that tells you the backend is
// alive. We use it to check that the server is running.

import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "inkwell-backend",
    time: new Date().toISOString(),
  });
});

// Location: backend/routes/health.routes.ts
// End of file: health.routes.ts