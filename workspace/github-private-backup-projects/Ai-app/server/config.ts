import path from "node:path";
import os from "node:os";
import dotenv from "dotenv";

dotenv.config();

const rootDir = process.cwd();
const serverPort = Number(process.env.PORT) || 5237;

// Gradle / Kotlin Daemon / KSP 对含非 ASCII 字符（中文、空格、特殊符号）的工程路径
// 会偶发报 "Could not normalize path"、NIO 编码异常或者 classpath 截断，导致编译莫名失败。
// 我们在这里集中拦截：一旦检测到 rootDir 含非 ASCII，自动把 temp/apk 输出重定向到
// 一个强制 ASCII 的路径（优先 $AI_APP_BUILD_DIR，否则 ~/.ai-app-builds），
// 既不影响代码仓库位置，也保证每次构建跑在"干净路径"上。
const NON_ASCII_PATH_PATTERN = /[^\x00-\x7F]/;

function hasNonAsciiPath(value: string) {
  return NON_ASCII_PATH_PATTERN.test(value);
}

const rootDirHasNonAscii = hasNonAsciiPath(rootDir);
const buildHostDir = rootDirHasNonAscii
  ? process.env.AI_APP_BUILD_DIR?.trim() || path.join(os.homedir(), ".ai-app-builds")
  : rootDir;

if (rootDirHasNonAscii) {
  console.warn(
    `[config] 检测到工程根目录包含非 ASCII 字符（${rootDir}），` +
      `已把 Gradle 构建/APK 输出重定向到 ASCII 安全路径：${buildHostDir}。` +
      `如需自定义，请设置环境变量 AI_APP_BUILD_DIR。`,
  );
}

export const config = {
  port: serverPort,
  rootDir,
  publicDir: path.join(rootDir, "public"),
  // APK 仍然通过 express.static 暴露，所以 apkDir 必须被服务端能访问到——
  // 当 rootDir 是安全路径时直接用 public/apks，否则用 ASCII 安全路径下的 apks 目录，
  // 并在 index.ts 里 static 挂载 config.apkDir 指向这里。
  apkDir: rootDirHasNonAscii
    ? path.join(buildHostDir, "apks")
    : path.join(rootDir, "public", "apks"),
  tempDir: rootDirHasNonAscii
    ? path.join(buildHostDir, "temp")
    : path.join(rootDir, "temp"),
  wrapperCacheDir: rootDirHasNonAscii
    ? path.join(buildHostDir, "android-wrapper")
    : path.join(rootDir, "android-wrapper"),
  buildPathIsAsciiSafe: !rootDirHasNonAscii,
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

// Gradle 实际运行目录 = tempDir/<uuid>/；只要 tempDir/apkDir/SDK 路径是 ASCII，
// 即使仓库根目录是中文也能正常构建（spawn 用 tempDir 当 cwd 由 build 代码里决定）。
export function assertBuildPathIsSafe() {
  for (const [name, value] of [
    ["tempDir", config.tempDir],
    ["apkDir", config.apkDir],
    ["androidHome", config.androidHome],
    ["javaHome", config.javaHome],
  ] as const) {
    if (hasNonAsciiPath(value)) {
      throw new Error(
        `[config] ${name} 路径包含非 ASCII 字符，Gradle 可能会随机编译失败：${value}。` +
          `请把项目移到纯英文目录，或设置环境变量 AI_APP_BUILD_DIR 指向一个 ASCII 路径。`,
      );
    }
  }
}

export function assertOpenAiConfigured() {
  if (!config.openAiApiKey) {
    throw new Error("缺少 OPENAI_API_KEY，请先在 .env 中配置。");
  }
}
