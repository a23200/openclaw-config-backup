import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

const schemaSql = `
CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "prd" TEXT NOT NULL,
  "apkUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

export async function ensureDatabase() {
  const dbFile = path.join(config.rootDir, "prisma", "dev.db");
  await mkdir(path.dirname(dbFile), { recursive: true });
  await execFileAsync("sqlite3", [dbFile, schemaSql]);
}
