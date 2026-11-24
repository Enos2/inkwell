// Location: backend/services/message.service.ts
// Purpose: Direct messages between two people. Sending creates the
// conversation if it does not exist yet. Each person has their own "last read"
// time, which gives unread counts. Sending is refused if either person has
// blocked the other, if the receiver is banned, or if the sender is sending
// more than 20 messages a minute (spam protection).

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import { isAccountBlocked } from "./session.service";

const MAX_MESSAGES_PER_MINUTE = 20;

const personSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const satisfies Prisma.UserSelect;

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  body: true,
  createdAt: true,
} as const satisfies Prisma.MessageSelect;

const conversationSelect = {
  id: true,
  userAId: true,
  userBId: true,
  userALastReadAt: true,
  userBLastReadAt: true,
  lastMessageAt: true,
  userA: { select: personSelect },
  userB: { select: personSelect },
} as const satisfies Prisma.ConversationSelect;

type ConversationRow = Prisma.ConversationGetPayload<{
  select: typeof conversationSelect;
}>;

// The two ids of a pair are always stored in sorted order.
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function otherUserId(
  conversation: { userAId: string; userBId: string },
  me: string
): string {
  return conversation.userAId === me ? conversation.userBId : conversation.userAId;
}

// Builds the update that sets MY "last read" time (and nothing of the other
// person's).
function readUpdate(
  conversation: { userAId: string },
  me: string,
  when: Date
): Prisma.ConversationUpdateInput {
  return conversation.userAId === me
    ? { userALastReadAt: when }
    : { userBLastReadAt: when };
}

async function loadConversation(
  userId: string,
  conversationId: string
): Promise<ConversationRow> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: conversationSelect,
  });
  if (
    !conversation ||
    (conversation.userAId !== userId && conversation.userBId !== userId)
  ) {
    throw new AppError("Conversation not found", 404);
  }
  return conversation;
}

async function assertCanMessage(sender: AuthUser, targetId: string) {
  if (targetId === sender.id) {
    throw new AppError("You cannot message yourself", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, status: true, bannedUntil: true },
  });
  if (!target || isAccountBlocked(target)) {
    throw new AppError("User not found", 404);
  }

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: sender.id, blockedId: targetId },
        { blockerId: targetId, blockedId: sender.id },
      ],
    },
    select: { blockerId: true },
  });
  if (block) {
    throw new AppError(
      block.blockerId === sender.id
        ? "You have blocked this user. Unblock them to send a message"
        : "You cannot message this user",
      403
    );
  }

  const recent = await prisma.message.count({
    where: {
      senderId: sender.id,
      createdAt: { gt: new Date(Date.now() - 60_000) },
    },
  });
  if (recent >= MAX_MESSAGES_PER_MINUTE) {
    throw new AppError(
      "You are sending messages too fast. Please wait a minute",
      429
    );
  }
}

async function saveMessage(
  sender: AuthUser,
  conversation: { id: string; userAId: string },
  body: string
) {
  const now = new Date();

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: sender.id,
        body,
        createdAt: now,
      },
      select: messageSelect,
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
        ...readUpdate(conversation, sender.id, now),
      },
    }),
  ]);

  return message;
}

// Sends a message to a person by username, starting the conversation if needed.
export async function sendMessageToUser(
  sender: AuthUser,
  username: string,
  body: string
) {
  const target = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!target) throw new AppError("User not found", 404);

  await assertCanMessage(sender, target.id);

  const [userAId, userBId] = orderPair(sender.id, target.id);
  const conversation = await prisma.conversation.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    create: { userAId, userBId },
    update: {},
    select: { id: true, userAId: true },
  });

  const message = await saveMessage(sender, conversation, body);
  return { conversationId: conversation.id, message };
}

// Sends a message inside a conversation that already exists.
export async function sendMessageInConversation(
  sender: AuthUser,
  conversationId: string,
  body: string
) {
  const conversation = await loadConversation(sender.id, conversationId);
  await assertCanMessage(sender, otherUserId(conversation, sender.id));

  const message = await saveMessage(sender, conversation, body);
  return { conversationId, message };
}

export async function listConversations(
  user: AuthUser,
  page: number,
  limit: number
) {
  const where: Prisma.ConversationWhereInput = {
    OR: [{ userAId: user.id }, { userBId: user.id }],
  };

  const [rows, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: conversationSelect,
    }),
    prisma.conversation.count({ where }),
  ]);

  const conversations = await Promise.all(
    rows.map(async (row) => {
      const isA = row.userAId === user.id;
      const myLastRead = isA ? row.userALastReadAt : row.userBLastReadAt;

      const [lastMessage, unreadCount] = await Promise.all([
        prisma.message.findFirst({
          where: { conversationId: row.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, body: true, senderId: true, createdAt: true },
        }),
        prisma.message.count({
          where: {
            conversationId: row.id,
            senderId: { not: user.id },
            createdAt: { gt: myLastRead },
          },
        }),
      ]);

      return {
        id: row.id,
        otherUser: isA ? row.userB : row.userA,
        lastMessage: lastMessage
          ? { ...lastMessage, body: lastMessage.body.slice(0, 120) }
          : null,
        unreadCount,
        lastMessageAt: row.lastMessageAt,
      };
    })
  );

  return { conversations, page, limit, total };
}

// Reading a conversation also marks it as read for the reader. Messages are
// returned newest first, so the app can show the latest ones and load older
// pages as the reader scrolls up.
export async function getMessages(
  user: AuthUser,
  conversationId: string,
  page: number,
  limit: number
) {
  const conversation = await loadConversation(user.id, conversationId);

  const where = { conversationId };
  const [messages, total] = await prisma.$transaction([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: messageSelect,
    }),
    prisma.message.count({ where }),
  ]);

  await prisma.conversation.update({
    where: { id: conversationId },
    data: readUpdate(conversation, user.id, new Date()),
  });

  const otherId = otherUserId(conversation, user.id);
  const otherUser =
    conversation.userA.id === otherId ? conversation.userA : conversation.userB;
  const blockedByMe =
    (await prisma.userBlock.count({
      where: { blockerId: user.id, blockedId: otherId },
    })) > 0;

  return {
    conversationId,
    otherUser,
    blockedByMe,
    messages,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

export async function markConversationRead(
  user: AuthUser,
  conversationId: string
) {
  const conversation = await loadConversation(user.id, conversationId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: readUpdate(conversation, user.id, new Date()),
  });
  return { conversationId, read: true };
}

// How many conversations have something new, for the little badge.
export async function getUnreadConversationCount(user: AuthUser) {
  const rows = await prisma.conversation.findMany({
    where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    select: {
      userAId: true,
      userALastReadAt: true,
      userBLastReadAt: true,
      lastMessageAt: true,
    },
    take: 500,
  });

  const unreadConversations = rows.filter((row) => {
    const myLastRead =
      row.userAId === user.id ? row.userALastReadAt : row.userBLastReadAt;
    return row.lastMessageAt.getTime() > myLastRead.getTime();
  }).length;

  return { unreadConversations };
}

export async function deleteMessage(user: AuthUser, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true },
  });
  if (!message) throw new AppError("Message not found", 404);
  if (message.senderId !== user.id) {
    throw new AppError("You can only delete your own messages", 403);
  }

  await prisma.message.delete({ where: { id: messageId } });
  return { message: "Message deleted", messageId };
}

// Location: backend/services/message.service.ts
// End of file: message.service.ts