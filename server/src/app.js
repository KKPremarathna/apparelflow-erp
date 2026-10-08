import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";

import authRoutes from "./routes/authRoutes.js";
import recipeRoutes from "./routes/recipeRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import verificationRoutes from "./routes/verificationRoutes.js";
import sewingRoutes from "./routes/sewingRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";

import { csrfProtection } from "./middleware/csrfProtection.js";

const app = express();
const production = process.env.NODE_ENV === "production";

const clientOrigin =
  process.env.CLIENT_URL || "http://localhost:5173";

const currentDirectory = path.dirname(
  fileURLToPath(import.meta.url)
);

const clientDistDirectory = path.resolve(
  currentDirectory,
  "../../client/dist"
);

app.disable("x-powered-by");

// Enable only when this app is deployed behind Render's proxy.
// Leave unset for ordinary local development.
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.use(helmet());

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "X-CSRF-Protection",
    ],
  })
);

app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "ApparelFlow API is running",
  });
});

app.use("/api", csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/sewing", sewingRoutes);
app.use("/api/activity", activityRoutes);

// Unknown API routes must return JSON, not the React index page.
app.use("/api", (req, res) => {
  return res.status(404).json({
    message: "API route not found.",
  });
});

if (production) {
  app.use(express.static(clientDistDirectory));

  app.get("/{*splat}", (req, res, next) => {
    // Avoid returning HTML for missing assets or non-HTML requests.
    if (path.extname(req.path) || !req.accepts("html")) {
      return next();
    }

    return res.sendFile(
      path.join(clientDistDirectory, "index.html")
    );
  });
}

app.use((req, res) => {
  return res.status(404).json({
    message: "Route not found.",
  });
});

export default app;