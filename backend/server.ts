// Project: Inkwell
// Location: backend/server.ts
// Purpose: The starting point of the Inkwell backend. It creates the server,
// adds security headers (helmet), allows the website to talk to it (CORS),
// reads JSON and cookies (and keeps the exact raw bytes of each request, which
// payment webhooks need for their signature check), applies the rate limits,
// connects the routes, and starts listening. The health check and the payment
// webhook are connected BEFORE the rate limit, so they are never blocked. The
// specific admin routes are connected BEFORE the general admin route. Every 10
// minutes it lifts expired suspensions and marks expired memberships. Fatal
// unexpected errors are logged.

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env } from "./config/env";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { adminRouter } from "./routes/admin.routes";
import { writerRouter } from "./routes/writer.routes";
import { adminWritersRouter } from "./routes/adminWriters.routes";
import { adminAdsRouter } from "./routes/adminAds.routes";
import { adminModerationRouter } from "./routes/adminModeration.routes";
import { adminPaymentsRouter } from "./routes/adminPayments.routes";
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
import { paymentRouter } from "./routes/payment.routes";
import { webhookRouter } from "./routes/webhook.routes";
import { membershipRouter } from "./routes/membership.routes";
import { walletRouter } from "./routes/wallet.routes";
import { searchRouter, discoverRouter } from "./routes/discovery.routes";
import { seriesRouter } from "./routes/series.routes";
import { engagementRouter } from "./routes/engagement.routes";
import {
  apiLimiter,
  loginLimiter,
  registerLimiter,
} from "./middleware/rateLimit";
import { liftExpiredSuspensions } from "./services/moderation.service";
import { expireMemberships } from "./services/catalog.service";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();

// Behind a hosting provider, the visitor's real address arrives in a header
// added by the host's proxy. Check how many proxies your host uses (1 is
// typical) when you deploy.
if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buffer) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buffer;
    },
  })
);
app.use(cookieParser());

// These two are never rate limited: uptime checks, and Paystack's own servers.
app.use("/api/health", healthRouter);
app.use("/api/webhooks", webhookRouter);

// Everything below is rate limited.
app.use("/api", apiLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);

app.use("/api/auth", authRouter);
app.use("/api/writer", writerRouter);
app.use("/api/admin/writers", adminWritersRouter);
app.use("/api/admin/ads", adminAdsRouter);
app.use("/api/admin/moderation", adminModerationRouter);
app.use("/api/admin/payments", adminPaymentsRouter);
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
app.use("/api/payments", paymentRouter);
app.use("/api/memberships", membershipRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/search", searchRouter);
app.use("/api/discover", discoverRouter);
app.use("/api/series", seriesRouter);
app.use("/api/engagement", engagementRouter);

app.use(notFoundHandler);
app.use(errorHandler);

// A failed sweep must never crash the server, so errors are only logged.
async function runSweeps(): Promise<void> {
  try {
    const lifted = await liftExpiredSuspensions();
    if (lifted > 0) {
      console.log(`Lifted ${lifted} expired suspension(s)`);
    }
  } catch (error) {
    console.error("Could not lift expired suspensions", error);
  }

  try {
    const expired = await expireMemberships();
    if (expired > 0) {
      console.log(`Marked ${expired} membership(s) as expired`);
    }
  } catch (error) {
    console.error("Could not expire memberships", error);
  }
}

// A forgotten error inside a promise is logged and the server keeps running.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});

// A truly unexpected crash leaves the server in an unknown state, so it is
// logged and the program stops. A host restarts it automatically.
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception, shutting down", error);
  process.exit(1);
});

app.listen(env.PORT, () => {
  console.log(`Inkwell backend running at http://localhost:${env.PORT}`);
  if (env.PAYMENTS_SANDBOX) {
    console.log(
      "WARNING: payments are in SANDBOX mode (fake payments, local testing only)"
    );
  }
  void runSweeps();
  setInterval(() => {
    void runSweeps();
  }, 10 * 60 * 1000);
});

// Location: backend/server.ts
// End of file: server.ts