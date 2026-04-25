import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  appendCodeChunk,
  appendLog,
  getBuild,
  initBuild,
  markCodeStreamComplete,
  replaceCodeOutput,
  setBuildError,
  setBuildSuccess,
  setStep,
} from "../lib/buildStore.js";
import { analyzeGeneratedCode, parseGeneratedFiles } from "../lib/generatedCodeParser.js";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import {
  generateAndroidCode,
  regenerateAndroidCode,
  repairAndroidProject,
} from "./openai.js";

const CODEGEN_STALL_WITHOUT_FILE_MS = 45_000;
const CODEGEN_STALL_CHECK_INTERVAL_MS = 3_000;

const CONTAMINATION_SIGNATURES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /to=functions\./i, label: "代理工具调用泄漏 (to=functions.*)" },
  { pattern: /\{\s*"cmd"\s*:\s*"bash/i, label: "shell 指令 JSON 泄漏" },
  { pattern: /\{\s*"status"\s*:\s*"ok"/i, label: "伪造的工具执行结果 JSON" },
  { pattern: /\bexec_command\b/i, label: "exec_command 代理上下文泄漏" },
  { pattern: /\byield_time_ms\b/i, label: "代理调度字段泄漏" },
  { pattern: /channel\s*=\s*(?:final|analysis)/i, label: "代理频道标识泄漏" },
];

function detectOutputContamination(rawCode: string): string | null {
  const hits = CONTAMINATION_SIGNATURES.filter(({ pattern }) => pattern.test(rawCode));
  if (hits.length === 0) {
    return null;
  }

  return hits.map(({ label }) => label).join("；");
}

function getBuildEnvironment() {
  const nextPath = [
    config.javaHome ? path.join(config.javaHome, "bin") : "",
    process.env.PATH ?? "",
  ]
    .filter(Boolean)
    .join(path.delimiter);

  return {
    ...process.env,
    PATH: nextPath,
    ANDROID_HOME: config.androidHome,
    JAVA_HOME: config.javaHome,
  };
}

async function ensureDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true });
}

function normalizeOutputPath(projectDir: string, rawPath: string) {
  const cleanedPath = rawPath.trim().replace(/^\//, "");
  const normalizedPath = path.normalize(cleanedPath);

  if (
    path.isAbsolute(normalizedPath) ||
    normalizedPath.startsWith("..") ||
    normalizedPath.includes(`..${path.sep}`)
  ) {
    throw new Error(`非法文件路径：${rawPath}`);
  }

  const resolvedPath = path.resolve(projectDir, normalizedPath);
  if (!resolvedPath.startsWith(`${projectDir}${path.sep}`) && resolvedPath !== projectDir) {
    throw new Error(`文件路径越界：${rawPath}`);
  }

  return resolvedPath;
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyRecursive(source: string, target: string) {
  await ensureDir(path.dirname(target));
  await cp(source, target, { recursive: true });
}

async function isValidWrapperDir(dirPath: string) {
  if (!dirPath) {
    return false;
  }

  return (
    (await pathExists(path.join(dirPath, "gradlew"))) &&
    (await pathExists(path.join(dirPath, "gradlew.bat"))) &&
    (await pathExists(path.join(dirPath, "gradle")))
  );
}

async function cacheWrapperFrom(sourceDir: string) {
  await ensureDir(config.wrapperCacheDir);
  await copyRecursive(path.join(sourceDir, "gradlew"), path.join(config.wrapperCacheDir, "gradlew"));
  await copyRecursive(path.join(sourceDir, "gradlew.bat"), path.join(config.wrapperCacheDir, "gradlew.bat"));
  await copyRecursive(path.join(sourceDir, "gradle"), path.join(config.wrapperCacheDir, "gradle"));
}

async function writeProjectFiles(
  projectDir: string,
  files: Array<{ filePath: string; content: string }>,
) {
  for (const file of files) {
    const targetPath = normalizeOutputPath(projectDir, file.filePath);
    await ensureDir(path.dirname(targetPath));
    await writeFile(targetPath, file.content, "utf8");
  }
}

async function writeLocalProperties(projectDir: string) {
  if (!config.androidHome) {
    return;
  }

  await writeFile(
    path.join(projectDir, "local.properties"),
    `sdk.dir=${config.androidHome.replaceAll("\\", "\\\\")}\n`,
    "utf8",
  );
}

async function updateTextFileIfExists(
  filePath: string,
  updater: (content: string) => string,
) {
  if (!(await pathExists(filePath))) {
    return false;
  }

  const currentContent = await readFile(filePath, "utf8");
  const nextContent = updater(currentContent);
  if (nextContent === currentContent) {
    return false;
  }

  await writeFile(filePath, nextContent, "utf8");
  return true;
}

async function repairCommonAndroidProjectIssues(projectId: string, projectDir: string) {
  const themeFiles = [
    path.join(projectDir, "app/src/main/res/values/themes.xml"),
    path.join(projectDir, "app/src/main/res/values-night/themes.xml"),
  ];

  for (const themeFile of themeFiles) {
    const repaired = await updateTextFileIfExists(themeFile, (content) => {
      return content
        .replaceAll(
          "Theme.Material3.DayNight.NoActionBar",
          "android:style/Theme.Material.Light.NoActionBar",
        )
        .replaceAll(
          "Theme.Material3.DayNight",
          "android:style/Theme.Material.Light",
        )
        .replaceAll(
          "Theme.AppCompat.Light.NoActionBar",
          "android:style/Theme.Material.Light.NoActionBar",
        )
        .replaceAll(
          "Theme.AppCompat.DayNight.NoActionBar",
          "android:style/Theme.Material.Light.NoActionBar",
        )
        .replaceAll(
          "Theme.AppCompat.Light",
          "android:style/Theme.Material.Light",
        );
    });

    if (repaired) {
      appendLog(projectId, `已修复 XML 主题父类：${path.relative(projectDir, themeFile)}`);
    }
  }

  const manifestAppCompatFixed = await updateTextFileIfExists(
    path.join(projectDir, "app/src/main/AndroidManifest.xml"),
    (content) =>
      content
        .replaceAll(
          "@style/Theme.AppCompat.Light.NoActionBar",
          "@android:style/Theme.Material.Light.NoActionBar",
        )
        .replaceAll(
          "@style/Theme.AppCompat.DayNight.NoActionBar",
          "@android:style/Theme.Material.Light.NoActionBar",
        ),
  );

  if (manifestAppCompatFixed) {
    appendLog(projectId, "已修复 AndroidManifest 中缺失的 AppCompat 主题引用");
  }

  const manifestPath = path.join(projectDir, "app/src/main/AndroidManifest.xml");
  const manifestRepaired = await updateTextFileIfExists(manifestPath, (content) => {
    return content.replace(/\s+package="[^"]*"/, "");
  });

  if (manifestRepaired) {
    appendLog(projectId, "已移除 AndroidManifest.xml 中废弃的 package 属性");
  }
}

async function repairCommonCompilationIssues(
  projectId: string,
  projectDir: string,
  errorLog: string,
) {
  let repairCount = 0;
  const mentionedFiles = extractPathsFromErrorLog(projectDir, errorLog);
  const kotlinTargets = mentionedFiles
    .filter((filePath) => filePath.endsWith(".kt"))
    .map((filePath) => path.join(projectDir, filePath));

  if (errorLog.includes("org.jetbrains.kotlin.plugin.compose")) {
    const rootGradleFixed = await updateTextFileIfExists(
      path.join(projectDir, "build.gradle.kts"),
      (content) =>
        content.replace(
          /^\s*id\("org\.jetbrains\.kotlin\.plugin\.compose"\).*apply false\s*$/gm,
          "",
        ),
    );

    if (rootGradleFixed) {
      repairCount += 1;
      appendLog(projectId, "已本地移除不可解析的 Kotlin Compose Gradle 插件声明");
    }
  }

  if (
    errorLog.includes("Unresolved reference: MenuAnchorType") ||
    errorLog.includes("Too many arguments for public abstract fun Modifier.menuAnchor()")
  ) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        content
          .replace(/^\s*import\s+androidx\.compose\.material3\.MenuAnchorType\s*$/gm, "")
          .replace(/\.menuAnchor\([^)]*\)/g, ".menuAnchor()"),
      );

      if (fixed) {
        repairCount += 1;
        appendLog(projectId, `已本地修复 menuAnchor API：${path.relative(projectDir, targetFile)}`);
      }
    }
  }

  if (
    errorLog.includes("Theme.AppCompat") &&
    errorLog.includes("not found")
  ) {
    repairCount += 1;
    appendLog(
      projectId,
      "检测到 AppCompat 主题缺失，将在通用修复阶段替换为 android:Theme.Material.Light",
    );
  }

  if (errorLog.includes("Unresolved reference: ExposedDropdownMenu")) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        content
          .replace(
            /^\s*import\s+androidx\.compose\.material3\.ExposedDropdownMenu\s*$/gm,
            "import androidx.compose.material3.DropdownMenu",
          )
          .replace(/\bExposedDropdownMenu\(/g, "DropdownMenu("),
      );

      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地回退 ExposedDropdownMenu 到 DropdownMenu：${path.relative(projectDir, targetFile)}`,
        );
      }
    }
  }

  if (
    errorLog.includes("This material API is experimental") ||
    errorLog.includes("This foundation API is experimental") ||
    errorLog.includes("ExperimentalMaterial3Api") ||
    errorLog.includes("ExperimentalFoundationApi")
  ) {
    const needsMaterial3 =
      errorLog.includes("This material API is experimental") ||
      errorLog.includes("ExperimentalMaterial3Api");
    const needsFoundation =
      errorLog.includes("This foundation API is experimental") ||
      errorLog.includes("ExperimentalFoundationApi");
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) => {
        if (content.includes("@file:OptIn")) return content;
        const packageMatch = content.match(/^(package\s+[\w.]+\s*\n)/m);
        if (!packageMatch) return content;
        const annotations: string[] = [];
        if (needsMaterial3) {
          annotations.push("androidx.compose.material3.ExperimentalMaterial3Api::class");
        }
        if (needsFoundation) {
          annotations.push("androidx.compose.foundation.ExperimentalFoundationApi::class");
        }
        if (annotations.length === 0) return content;
        const header = `@file:OptIn(${annotations.join(", ")})\n\n`;
        return header + content;
      });

      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地注入 @file:OptIn：${path.relative(projectDir, targetFile)}`,
        );
      }
    }
  }

  if (errorLog.includes("Unresolved reference: collectIsPressedAsState")) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) => {
        let next = content;
        next = next.replace(
          /^\s*import\s+androidx\.compose\.foundation\.interaction\.collectIsPressedAsState\s*\n/gm,
          "",
        );
        next = next.replace(
          /val\s+(\w+)\s+by\s+collectIsPressedAsState\([^)]*\)/g,
          "val $1 = false",
        );
        next = next.replace(
          /androidx\.compose\.foundation\.interaction\.collectIsPressedAsState\([^)]*\)\.value/g,
          "false",
        );
        return next === content ? content : next;
      });
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地替换不可用的 collectIsPressedAsState（compose-bom 2024.06 不支持），按压动画已禁用：${path.relative(projectDir, targetFile)}`,
        );
      }
    }
  }

  return repairCount > 0;
}

async function ensureGradleWrapperSeed() {
  const gradlewPath = path.join(config.wrapperCacheDir, "gradlew");
  const gradleDirPath = path.join(config.wrapperCacheDir, "gradle");

  if (await isValidWrapperDir(config.wrapperCacheDir)) {
    return config.wrapperCacheDir;
  }

  const wrapperCandidates = [
    config.gradleWrapperDir,
    path.join(config.rootDir, "android-wrapper"),
    "/Users/mac/Make app/android",
  ];

  for (const candidate of wrapperCandidates) {
    if (candidate === config.wrapperCacheDir) {
      continue;
    }

    if (await isValidWrapperDir(candidate)) {
      await cacheWrapperFrom(candidate);
      return config.wrapperCacheDir;
    }
  }

  const bootstrapDir = path.join(config.tempDir, "__gradle-wrapper-bootstrap__");
  await rm(bootstrapDir, { force: true, recursive: true });
  await ensureDir(bootstrapDir);
  await ensureDir(config.wrapperCacheDir);

  await new Promise<void>((resolve, reject) => {
    const child = spawn("gradle", ["wrapper", "--gradle-version", config.gradleVersion], {
      cwd: bootstrapDir,
      env: getBuildEnvironment(),
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`执行 gradle wrapper 失败，退出码：${code}`));
      }
    });
    child.on("error", reject);
  });

  await copyRecursive(path.join(bootstrapDir, "gradlew"), gradlewPath);
  await copyRecursive(path.join(bootstrapDir, "gradlew.bat"), path.join(config.wrapperCacheDir, "gradlew.bat"));
  await copyRecursive(path.join(bootstrapDir, "gradle"), gradleDirPath);

  return config.wrapperCacheDir;
}

async function writeGeneratedFiles(projectId: string, rawCode: string) {
  const projectDir = path.join(config.tempDir, projectId);
  await rm(projectDir, { force: true, recursive: true });
  await ensureDir(projectDir);
  await writeFile(path.join(projectDir, "_raw_model_output.md"), rawCode, "utf8");
  appendLog(projectId, `已保存原始 AI 输出：temp/${projectId}/_raw_model_output.md`);

  const files = parseGeneratedFiles(rawCode);
  if (files.length === 0) {
    const contaminationReason = detectOutputContamination(rawCode);
    if (contaminationReason) {
      appendLog(projectId, `检测到 AI 输出污染：${contaminationReason}`);
      throw new Error(
        `AI 输出被污染，未产生任何代码文件。污染特征：${contaminationReason}`,
      );
    }
    throw new Error("未从 AI 输出中解析到任何代码文件。");
  }

  await writeProjectFiles(projectDir, files);
  await writeLocalProperties(projectDir);

  return {
    projectDir,
    files,
  };
}

function getRecentBuildLogExcerpt(projectId: string, maxLines = 120) {
  const build = getBuild(projectId);
  return build?.logs.slice(-maxLines).join("\n") ?? "";
}

function summarizeBuildFailure(projectId: string, fallbackMessage: string) {
  const errorLog = getRecentBuildLogExcerpt(projectId, 160);
  const lines = errorLog
    .split("\n")
    .map((line) => line.replace(/^\[[^\]]+\]\s*/, "").trim())
    .filter(Boolean);

  const kotlinErrors = lines
    .filter((line) => line.startsWith("e: "))
    .map((line) => line.replace(/^e:\s*/, ""))
    .slice(0, 3);

  if (kotlinErrors.length > 0) {
    return `Kotlin 编译失败：${kotlinErrors.join("；")}`;
  }

  const pluginError = lines.find(
    (line) =>
      line.startsWith("Plugin [") ||
      line.includes("was not found in any of the following sources"),
  );
  if (pluginError) {
    return `Gradle 插件解析失败：${pluginError}`;
  }

  const gradleFailureIndex = lines.findIndex((line) => line === "* What went wrong:");
  if (gradleFailureIndex >= 0) {
    const nextLine = lines.slice(gradleFailureIndex + 1).find(Boolean);
    if (nextLine) {
      return `Gradle 构建失败：${nextLine}`;
    }
  }

  return fallbackMessage;
}

function extractPathsFromErrorLog(projectDir: string, errorLog: string) {
  const normalizedLog = errorLog.replaceAll("\\", "/");
  const escapedProjectDir = projectDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\", "/");
  const paths = new Set<string>();
  const patterns = [
    new RegExp(`${escapedProjectDir}/([^\\s:]+\\.(?:kt|kts|xml|properties|pro))`, "g"),
    /((?:app|gradle)\/[^\s:]+?\.(?:kt|kts|xml|properties|pro))/g,
    /((?:settings\.gradle\.kts|build\.gradle\.kts|gradle\.properties))/g,
  ];

  for (const pattern of patterns) {
    for (const match of normalizedLog.matchAll(pattern)) {
      const captured = match[1]?.trim();
      if (captured) {
        paths.add(captured);
      }
    }
  }

  return [...paths];
}

async function listProjectFiles(projectDir: string, currentDir = projectDir, collected: string[] = []) {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if ([".gradle", "build", "gradle", ".idea"].includes(entry.name)) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(projectDir, absolutePath);

    if (entry.isDirectory()) {
      await listProjectFiles(projectDir, absolutePath, collected);
      continue;
    }

    if (
      relativePath === "_raw_model_output.md" ||
      relativePath === "local.properties" ||
      relativePath === "gradlew" ||
      relativePath === "gradlew.bat"
    ) {
      continue;
    }

    collected.push(relativePath);
  }

  return collected;
}

async function collectProjectRepairContext(projectDir: string, errorLog: string) {
  const importantFiles = [
    "settings.gradle.kts",
    "build.gradle.kts",
    "gradle.properties",
    "app/build.gradle.kts",
    "app/src/main/AndroidManifest.xml",
    "app/src/main/res/values/themes.xml",
    "app/src/main/res/values-night/themes.xml",
  ];
  const mentionedFiles = extractPathsFromErrorLog(projectDir, errorLog);
  const projectFiles = await listProjectFiles(projectDir);
  const selectedFiles = [...new Set([...importantFiles, ...mentionedFiles])]
    .filter((filePath) => projectFiles.includes(filePath))
    .slice(0, 14);

  const fileBlocks: string[] = [];
  for (const relativePath of selectedFiles) {
    const absolutePath = path.join(projectDir, relativePath);
    const content = await readFile(absolutePath, "utf8");
    fileBlocks.push(`\`\`\`${relativePath}\n${content.slice(0, 12000)}\n\`\`\``);
  }

  const structure = projectFiles.slice(0, 80).join("\n");
  return `项目文件列表：\n${structure}\n\n关键文件内容：\n${fileBlocks.join("\n\n")}`;
}

interface StreamingCodegenCallbacks {
  streamSignal: AbortSignal;
  onTextChunk: (chunk: string) => void;
  onResolvedModel: (model: string, aliased: boolean) => void;
}

async function runStreamingCodegen(
  projectId: string,
  modelLogLabel: string,
  invoke: (opts: StreamingCodegenCallbacks) => Promise<string>,
) {
  const waitingLogs = [
    "AI 正在推理项目结构，请稍候…",
    "正在组织 Gradle、Manifest 与 Compose 页面代码…",
    "正在生成 MVVM 层与界面代码流…",
  ];

  let heartbeatIndex = 0;
  let receivedChunk = false;
  let streamedCode = "";
  let firstChunkAt: number | null = null;
  let hasStructuredOutput = false;
  let streamForcedFallback = false;
  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    appendLog(projectId, waitingLogs[heartbeatIndex % waitingLogs.length]);
    heartbeatIndex += 1;
  }, 3500);
  const stallWatcher = setInterval(() => {
    if (
      !receivedChunk ||
      firstChunkAt === null ||
      hasStructuredOutput ||
      streamForcedFallback
    ) {
      return;
    }

    if (Date.now() - firstChunkAt < CODEGEN_STALL_WITHOUT_FILE_MS) {
      return;
    }

    streamForcedFallback = true;
    appendLog(
      projectId,
      `检测到流式输出超过 ${Math.round(
        CODEGEN_STALL_WITHOUT_FILE_MS / 1000,
      )} 秒仍未形成有效文件块，切换到完整结果模式`,
    );
    controller.abort();
  }, CODEGEN_STALL_CHECK_INTERVAL_MS);

  let generatedCode = "";
  try {
    generatedCode = await invoke({
      streamSignal: controller.signal,
      onResolvedModel: (model, aliased) => {
        appendLog(
          projectId,
          aliased
            ? `${modelLogLabel}切换到兼容模型：${model}`
            : `${modelLogLabel}模型：${model}`,
        );
      },
      onTextChunk: (chunk) => {
        streamedCode += chunk;
        if (!receivedChunk) {
          receivedChunk = true;
          firstChunkAt = Date.now();
          appendLog(projectId, "已收到实时代码流，右侧代码预览开始刷新");
        }
        appendCodeChunk(projectId, chunk);

        const analyzed = analyzeGeneratedCode(streamedCode, {
          includeOpenFile: true,
        });
        hasStructuredOutput = analyzed.generatedFileCount > 0;
      },
    });
  } finally {
    clearInterval(heartbeat);
    clearInterval(stallWatcher);
  }

  if (!receivedChunk) {
    appendLog(projectId, "未收到流式片段，已使用完整返回结果填充代码预览");
    replaceCodeOutput(projectId, generatedCode);
  } else if (generatedCode.trim() && generatedCode.trim() !== streamedCode.trim()) {
    appendLog(
      projectId,
      streamForcedFallback
        ? "已使用完整返回结果替换卡住的流式输出"
        : "已使用完整返回结果刷新代码预览",
    );
    replaceCodeOutput(projectId, generatedCode);
  }

  return generatedCode;
}

async function materializeGeneratedProject(
  projectId: string,
  prd: string,
  initialRawCode: string,
) {
  let rawCode = initialRawCode;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const generatedProject = await writeGeneratedFiles(projectId, rawCode);
      appendLog(
        projectId,
        `已解析 ${generatedProject.files.length} 个代码文件并写入临时工程目录`,
      );
      await repairCommonAndroidProjectIssues(projectId, generatedProject.projectDir);
      return {
        projectDir: generatedProject.projectDir,
        rawCode,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "未知解析错误";
      if (attempt >= maxAttempts) {
        throw error;
      }

      appendLog(projectId, `AI 工程解析失败：${reason}`);
      appendLog(projectId, `准备重新生成完整工程（第 ${attempt + 1} 次）`);
      const previousRawCode = rawCode;
      rawCode = await runStreamingCodegen(
        projectId,
        `第 ${attempt + 1} 次重新生成`,
        (opts) => regenerateAndroidCode(prd, previousRawCode, reason, opts),
      );
    }
  }

  throw new Error("AI 工程多次生成后仍无法解析。");
}

async function copyGradleWrapper(projectDir: string) {
  const wrapperSourceDir = await ensureGradleWrapperSeed();
  await copyRecursive(path.join(wrapperSourceDir, "gradlew"), path.join(projectDir, "gradlew"));
  await copyRecursive(path.join(wrapperSourceDir, "gradlew.bat"), path.join(projectDir, "gradlew.bat"));
  await copyRecursive(path.join(wrapperSourceDir, "gradle"), path.join(projectDir, "gradle"));
}

async function runGradleBuild(projectId: string, projectDir: string) {
  const buildCommand = `cd ${JSON.stringify(projectDir)} && chmod +x ./gradlew && ./gradlew assembleDebug`;

  return new Promise<void>((resolve, reject) => {
    const child = spawn("sh", ["-c", buildCommand], {
      cwd: config.rootDir,
      env: getBuildEnvironment(),
    });

    child.stdout.on("data", (buffer) => {
      appendLog(projectId, buffer.toString().trim());
    });

    child.stderr.on("data", (buffer) => {
      appendLog(projectId, buffer.toString().trim());
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Gradle 构建失败，退出码：${code}`));
      }
    });
  });
}

async function moveApk(projectId: string, projectDir: string) {
  const sourceApk = path.join(
    projectDir,
    "app",
    "build",
    "outputs",
    "apk",
    "debug",
    "app-debug.apk",
  );
  const targetApk = path.join(config.apkDir, `${projectId}.apk`);
  await ensureDir(config.apkDir);
  await rename(sourceApk, targetApk);

  return `/apks/${projectId}.apk`;
}

export async function startBuild(projectId: string) {
  const existingProject = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!existingProject) {
    throw new Error("项目不存在。");
  }

  initBuild(projectId);

  void (async () => {
    try {
      appendLog(projectId, "开始分析最终需求文档");
      setStep(projectId, "analysis", "generating");
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "generating" },
      });

      appendLog(projectId, "调用 OpenAI 生成安卓项目代码");
      setStep(projectId, "codegen", "generating");

      const generatedCode = await runStreamingCodegen(
        projectId,
        "当前代码生成",
        (opts) => generateAndroidCode(existingProject.prd, opts),
      );

      markCodeStreamComplete(projectId);
      appendLog(projectId, "代码生成完成，开始解析文件");

      const generatedProject = await materializeGeneratedProject(
        projectId,
        existingProject.prd,
        generatedCode,
      );
      const projectDir = generatedProject.projectDir;

      await copyGradleWrapper(projectDir);
      appendLog(projectId, "Gradle 包装器复制完成");

      setStep(projectId, "compile", "building");
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "building" },
      });

      appendLog(projectId, "开始执行 ./gradlew assembleDebug");
      await runGradleBuildWithAiRepair(projectId, projectDir, existingProject.prd);

      const apkUrl = await moveApk(projectId, projectDir);
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: "ready",
          apkUrl,
        },
      });

      setBuildSuccess(projectId, apkUrl);
      appendLog(projectId, `APK 生成完成：${apkUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      const summarizedMessage = summarizeBuildFailure(projectId, message);
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: "failed",
          apkUrl: null,
        },
      });
      setBuildError(projectId, summarizedMessage);
    }
  })();
}

async function runGradleBuildWithAiRepair(
  projectId: string,
  projectDir: string,
  prd: string,
) {
  const maxRepairAttempts = 3;

  for (let repairAttempt = 0; repairAttempt <= maxRepairAttempts; repairAttempt += 1) {
    try {
      await runGradleBuild(projectId, projectDir);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知编译错误";
      if (repairAttempt >= maxRepairAttempts) {
        throw error;
      }

      const errorLog = getRecentBuildLogExcerpt(projectId);
      appendLog(projectId, `第 ${repairAttempt + 1} 次编译失败：${message}`);

       const locallyRepaired = await repairCommonCompilationIssues(projectId, projectDir, errorLog);
      if (locallyRepaired) {
        await repairCommonAndroidProjectIssues(projectId, projectDir);
        await writeLocalProperties(projectDir);
        appendLog(projectId, "已应用本地兼容修复，重新执行 ./gradlew assembleDebug");
        continue;
      }

      appendLog(projectId, "调用 AI 修复当前安卓工程后重新编译");

      const projectContext = await collectProjectRepairContext(projectDir, errorLog);
      const repairOutput = await repairAndroidProject(prd, errorLog, projectContext, {
        onResolvedModel: (model, aliased) => {
          appendLog(
            projectId,
            aliased ? `AI 修复切换到兼容模型：${model}` : `AI 修复模型：${model}`,
          );
        },
      });
      const repairedFiles = parseGeneratedFiles(repairOutput);
      if (repairedFiles.length === 0) {
        throw new Error("AI 修复没有返回任何可写入文件。");
      }

      await writeProjectFiles(projectDir, repairedFiles);
      await writeLocalProperties(projectDir);
      appendLog(projectId, `AI 修复完成，已更新 ${repairedFiles.length} 个文件`);
      await repairCommonAndroidProjectIssues(projectId, projectDir);
      appendLog(projectId, "重新执行 ./gradlew assembleDebug");
    }
  }

  throw new Error("AI 修复多次后仍未通过编译。");
}

export async function getBuildStatus(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new Error("项目不存在。");
  }

  const existing = getBuild(projectId);
  if (!existing && (project.status === "generating" || project.status === "building")) {
    const interruptionMessage =
      "检测到开发服务已重启，原构建任务已中断，请重新触发构建。";

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "failed",
      },
    });

    initBuild(projectId);
    const staleBuild = getBuild(projectId)!;
    staleBuild.status = "failed";
    staleBuild.step = "failed";
    staleBuild.error = interruptionMessage;
    staleBuild.streamState = "complete";
    staleBuild.logs = [`[${new Date().toISOString()}] ${interruptionMessage}`];

    return {
      projectId,
      status: staleBuild.status,
      step: staleBuild.step,
      logs: staleBuild.logs,
      apkUrl: project.apkUrl ?? null,
      error: staleBuild.error,
      updatedAt: staleBuild.updatedAt,
      activeFile: staleBuild.activeFile,
      codePreview: staleBuild.codePreview,
      generatedFiles: staleBuild.generatedFiles,
      generatedFileCount: staleBuild.generatedFileCount,
      streamState: staleBuild.streamState,
    };
  }

  const build = initIfNeeded(projectId, project.status, project.apkUrl);
  return {
    projectId,
    status: build.status,
    step: build.step,
    logs: build.logs,
    apkUrl: project.apkUrl ?? build.apkUrl ?? null,
    error: build.error,
    updatedAt: build.updatedAt,
    activeFile: build.activeFile,
    codePreview: build.codePreview,
    generatedFiles: build.generatedFiles,
    generatedFileCount: build.generatedFileCount,
    streamState: build.streamState,
  };
}

function initIfNeeded(projectId: string, status: string, apkUrl: string | null) {
  const existing = getBuild(projectId);
  if (existing) {
    if (apkUrl && !existing.apkUrl) {
      existing.apkUrl = apkUrl;
    }
    if (status === "ready" && existing.status !== "ready") {
      existing.status = "ready";
      existing.step = "complete";
      existing.streamState = "complete";
    }
    return existing;
  }

  initBuild(projectId);
  const hydratedBuild = getBuild(projectId)!;
  hydratedBuild.status = (status as typeof hydratedBuild.status) ?? "draft";
  hydratedBuild.step =
    status === "ready" ? "complete" : status === "building" ? "compile" : "analysis";
  hydratedBuild.logs = [];
  hydratedBuild.apkUrl = apkUrl;
  hydratedBuild.streamState = status === "ready" ? "complete" : "idle";
  return hydratedBuild;
}
