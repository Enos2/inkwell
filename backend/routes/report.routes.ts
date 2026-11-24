// Location: backend/routes/report.routes.ts
// Purpose: The report addresses under /api/reports. All need a logged-in user:
// POST / sends a report about a story, chapter, comment or user, and GET /mine
// shows the status of the reports you sent.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import { createReport, listMyReports } from "../services/report.service";
import { createReportSchema } from "../validators/moderation.validator";
import { pageQuerySchema } from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const reportRouter = Router();

reportRouter.use(authenticate);

reportRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createReportSchema.parse(req.body);
    res.status(201).json(await createReport(getAuthUser(res), input));
  })
);

reportRouter.get(
  "/mine",
  asyncHandler(async (req, res) => {
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listMyReports(getAuthUser(res), page, limit));
  })
);

// Location: backend/routes/report.routes.ts
// End of file: report.routes.ts