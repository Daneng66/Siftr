// Load .env before any module reads process.env (config.ts evaluates at import
// time). No-op in production where there's no .env file.
import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { config, ensureDataDirs } from "./config";
import { getDb } from "./db";
import { apiRouter } from "./routes";
import { scanLibrary } from "./scanner";
import { generateThumbnails } from "./scanner/thumbnails";
import { jobs } from "./jobs";
import { ZodError } from "zod";

function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  // CORS is only needed when the Vite dev server runs on a different origin.
  if (process.env.NODE_ENV !== "production") app.use(cors());

  app.use("/api", apiRouter);

  // Serve the built SPA (if present) with history-API fallback.
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(config.clientDist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("text/plain").send(
        "Siftr API is running. The web UI build was not found at " +
          config.clientDist +
          ". Run `npm run build:client` (or use the Docker image)."
      );
    });
  }

  // Centralised error handler — Zod validation errors become 400s.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "validation", details: err.issues });
      }
      console.error("[api] error:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "internal error" });
    }
  );

  return app;
}

function main() {
  ensureDataDirs();
  getDb(); // open + migrate

  // Fail any jobs left "running" by a previous process so the UI doesn't show
  // a scan as perpetually in progress.
  const orphaned = jobs.reconcileOnStartup();
  if (orphaned > 0) console.log(`Marked ${orphaned} interrupted job(s) as failed`);

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Siftr listening on http://0.0.0.0:${config.port}`);
    console.log(`Data dir: ${config.dataDir}`);
  });

  if (config.scanOnStartup && !jobs.isRunning("scan")) {
    console.log("Starting initial library scan…");
    scanLibrary()
      .then(() => generateThumbnails())
      .catch((err) => console.error("[scan] startup failed:", err));
  }
}

main();
