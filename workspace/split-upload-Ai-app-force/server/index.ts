import express from "express";
import cors from "cors";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { config } from "./config.js";
import projectRoutes from "./routes/projects.js";
import buildRoutes from "./routes/builds.js";
import { ensureDatabase } from "./lib/database.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "4mb" }));
app.use("/apks", express.static(path.join(config.publicDir, "apks")));
app.use("/api/projects", projectRoutes);
app.use("/api/builds", buildRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

async function bootstrap() {
  await ensureDatabase();
  await mkdir(config.apkDir, { recursive: true });
  await mkdir(config.tempDir, { recursive: true });

  const clientDistDir = path.join(config.rootDir, "dist", "client");
  if (existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.use((req, res, next) => {
      if (
        req.method !== "GET" ||
        req.path.startsWith("/api") ||
        req.path.startsWith("/apks")
      ) {
        next();
        return;
      }

      res.sendFile(path.join(clientDistDir, "index.html"));
    });
  }

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = error instanceof Error ? error.message : "服务器内部错误";
      res.status(500).json({ message });
    },
  );

  app.listen(config.port, () => {
    console.log(`AI应用生成器服务已启动：http://localhost:${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
