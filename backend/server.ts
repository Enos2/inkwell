// Location: backend/server.ts
// Purpose: The starting point of the Inkwell backend. It creates the server,
// allows the website to talk to it (CORS), reads JSON and cookies, connects the
// routes, and starts listening for requests.

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { healthRouter } from "./routes/health.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api/health", healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Inkwell backend running at http://localhost:${env.PORT}`);
});

// Location: backend/server.ts
// End of file: server.ts