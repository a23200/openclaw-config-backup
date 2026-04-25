import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const rootDir = process.cwd();

export const config = {
  port: Number(process.env.PORT ?? 3001),
  rootDir,
  publicDir: path.join(rootDir, "public"),
  apkDir: path.join(rootDir, "public", "apks"),
  tempDir: path.join(rootDir, "temp"),
  wrapperCacheDir: path.join(rootDir, "android-wrapper"),
  gradleWrapperDir: process.env.GRADLE_WRAPPER_DIR ?? "",
  prismaDbUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.codexzh.com/v1",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-5.4",
  openAiCodeModel: process.env.OPENAI_CODE_MODEL ?? "gpt-5.4",
  androidHome: process.env.ANDROID_HOME ?? "/Users/mac/Library/Android/sdk",
  javaHome: process.env.JAVA_HOME ?? "/opt/homebrew/opt/openjdk@17",
  gradleVersion: process.env.GRADLE_VERSION ?? "8.7",
};

export function assertOpenAiConfigured() {
  if (!config.openAiApiKey) {
    throw new Error("缺少 OPENAI_API_KEY，请先在 .env 中配置。");
  }
}
