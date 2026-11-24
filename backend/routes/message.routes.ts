// Location: backend/routes/message.routes.ts
// Purpose: The messaging addresses under /api/messages. All need a logged-in
// user. Send a first message with POST /send (by username), list your
// conversations, open one (this marks it as read), reply inside it, and delete
// your own message.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  deleteMessage,
  getMessages,
  getUnreadConversationCount,
  listConversations,
  markConversationRead,
  sendMessageInConversation,
  sendMessageToUser,
} from "../services/message.service";
import {
  conversationIdParamSchema,
  messageIdParamSchema,
  messagesQuerySchema,
  replyMessageSchema,
  sendMessageSchema,
} from "../validators/message.validator";
import { pageQuerySchema } from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const messageRouter = Router();

messageRouter.use(authenticate);

messageRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listConversations(getAuthUser(res), page, limit));
  })
);

messageRouter.get(
  "/unread-count",
  asyncHandler(async (_req, res) => {
    res.json(await getUnreadConversationCount(getAuthUser(res)));
  })
);

messageRouter.post(
  "/send",
  asyncHandler(async (req, res) => {
    const { username, body } = sendMessageSchema.parse(req.body);
    res
      .status(201)
      .json(await sendMessageToUser(getAuthUser(res), username, body));
  })
);

messageRouter.get(
  "/conversations/:conversationId",
  asyncHandler(async (req, res) => {
    const { conversationId } = conversationIdParamSchema.parse(req.params);
    const { page, limit } = messagesQuerySchema.parse(req.query);
    res.json(await getMessages(getAuthUser(res), conversationId, page, limit));
  })
);

messageRouter.post(
  "/conversations/:conversationId/read",
  asyncHandler(async (req, res) => {
    const { conversationId } = conversationIdParamSchema.parse(req.params);
    res.json(await markConversationRead(getAuthUser(res), conversationId));
  })
);

messageRouter.post(
  "/conversations/:conversationId/messages",
  asyncHandler(async (req, res) => {
    const { conversationId } = conversationIdParamSchema.parse(req.params);
    const { body } = replyMessageSchema.parse(req.body);
    res
      .status(201)
      .json(
        await sendMessageInConversation(getAuthUser(res), conversationId, body)
      );
  })
);

messageRouter.delete(
  "/:messageId",
  asyncHandler(async (req, res) => {
    const { messageId } = messageIdParamSchema.parse(req.params);
    res.json(await deleteMessage(getAuthUser(res), messageId));
  })
);

// Location: backend/routes/message.routes.ts
// End of file: message.routes.ts