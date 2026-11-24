// Location: backend/validators/message.validator.ts
// Purpose: Checks everything sent to the messaging addresses: the message text
// (1 to 2000 characters), who it is sent to, the conversation and message ids
// in the address, and the page options for reading a conversation.

import { z } from "zod";

const bodyField = z.string().trim().min(1).max(2000);

export const sendMessageSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(20),
  body: bodyField,
});

export const replyMessageSchema = z.object({
  body: bodyField,
});

export const conversationIdParamSchema = z.object({
  conversationId: z.string().min(1).max(40),
});

export const messageIdParamSchema = z.object({
  messageId: z.string().min(1).max(40),
});

export const messagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// Location: backend/validators/message.validator.ts
// End of file: message.validator.ts