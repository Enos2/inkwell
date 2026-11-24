// Location: backend/server.ts
// Purpose: The starting point of the Inkwell backend. It creates the server,
// allows the website to talk to it (CORS), reads JSON and cookies, connects the
// routes, and starts listening for requests. The specific admin routes
// (writers, ads, moderation) are connected BEFORE the general admin route. It
// also lifts expired suspensions at startup and every 10 minutes.

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { adminRouter } from "./routes/admin.routes";
import { writerRouter } from "./routes/writer.routes";
import { adminWritersRouter } from "./routes/adminWriters.routes";
import { adminAdsRouter } from "./routes/adminAds.routes";
import { adminModerationRouter } from "./routes/adminModeration.routes";
import { adRouter } from "./routes/ad.routes";
import { reportRouter } from "./routes/report.routes";
import { featuredRouter } from "./routes/featured.routes";
import { storyRouter, tagRouter } from "./routes/story.routes";
import { chapterRouter } from "./routes/chapter.routes";
import { libraryRouter } from "./routes/library.routes";
import { progressRouter } from "./routes/progress.routes";
import { likeRouter } from "./routes/like.routes";
import { commentRouter } from "./routes/comment.routes";
import { followRouter, feedRouter } from "./routes/follow.routes";
import { notificationRouter } from "./routes/notification.routes";
import { profileRouter } from "./routes/profile.routes";
import { messageRouter } from "./routes/message.routes";
import { blockRouter } from "./routes/block.routes";
import { liftExpiredSuspensions } from "./services/moderation.service";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/writer", writerRouter);
app.use("/api/admin/writers", adminWritersRouter);
app.use("/api/admin/ads", adminAdsRouter);
app.use("/api/admin/moderation", adminModerationRouter);
app.use("/api/admin", adminRouter);
app.use("/api/ads", adRouter);
app.use("/api/reports", reportRouter);
app.use("/api/featured", featuredRouter);
app.use("/api/stories", storyRouter);
app.use("/api/tags", tagRouter);
app.use("/api/chapters", chapterRouter);
app.use("/api/library", libraryRouter);
app.use("/api/progress", progressRouter);
app.use("/api/likes", likeRouter);
app.use("/api/comments", commentRouter);
app.use("/api/follows", followRouter);
app.use("/api/feed", feedRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/users", profileRouter);
app.use("/api/messages", messageRouter);
app.use("/api/blocks", blockRouter);

app.use(notFoundHandler);
app.use(errorHandler);

// A failed sweep must never crash the server, so errors are only logged.
async function sweepSuspensions(): Promise<void> {
  try {
    const lifted = await liftExpiredSuspensions();
    if (lifted > 0) {
      console.log(`Lifted ${lifted} expired suspension(s)`);
    }
  } catch (error) {
    console.error("Could not lift expired suspensions", error);
  }
}

app.listen(env.PORT, () => {
  console.log(`Inkwell backend running at http://localhost:${env.PORT}`);
  void sweepSuspensions();
  setInterval(() => {
    void sweepSuspensions();
  }, 10 * 60 * 1000);
});

// Location: backend/server.ts
// End of file: server.ts