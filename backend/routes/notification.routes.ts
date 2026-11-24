// Location: backend/routes/notification.routes.ts
// Purpose: The notification addresses under /api/notifications. List them
// (add ?unread=true for unread only), get the unread count for the little
// badge, and mark one or all as read. All need a logged-in user.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notification.service";
import {
  notificationIdParamSchema,
  notificationsQuerySchema,
} from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const notificationRouter = Router();

notificationRouter.use(authenticate);

notificationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, unread } = notificationsQuerySchema.parse(req.query);
    res.json(await listNotifications(getAuthUser(res).id, page, limit, unread));
  })
);

notificationRouter.get(
  "/unread-count",
  asyncHandler(async (_req, res) => {
    res.json(await getUnreadCount(getAuthUser(res).id));
  })
);

notificationRouter.post(
  "/read-all",
  asyncHandler(async (_req, res) => {
    res.json(await markAllNotificationsRead(getAuthUser(res).id));
  })
);

notificationRouter.post(
  "/:notificationId/read",
  asyncHandler(async (req, res) => {
    const { notificationId } = notificationIdParamSchema.parse(req.params);
    res.json(await markNotificationRead(getAuthUser(res).id, notificationId));
  })
);

// Location: backend/routes/notification.routes.ts
// End of file: notification.routes.ts