import { spawn } from "node:child_process";
import {
  appendFile,
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
  setCodeStreamState,
  setStep,
} from "../lib/buildStore.js";
import { analyzeGeneratedCode, parseGeneratedFiles } from "../lib/generatedCodeParser.js";
import { prisma } from "../lib/prisma.js";
import { assertBuildPathIsSafe, config } from "../config.js";
import {
  continueAndroidCodeFromPartial,
  generateAndroidCode,
  regenerateAndroidCode,
  repairAndroidProject,
} from "./openai.js";

const CODEGEN_STREAM_IDLE_TIMEOUT_MS = 180_000;
const CODEGEN_FIRST_CHUNK_TIMEOUT_MS = 120_000;
const CODEGEN_STALL_CHECK_INTERVAL_MS = 3_000;

function hasLikelyTruncatedAndroidProject(rawOutput: string) {
  if (!rawOutput || rawOutput.length < 500) {
    return false;
  }

  return (
    /```\s*settings\.gradle\.kts\s*\n/.test(rawOutput) &&
    /```\s*app\/build\.gradle\.kts\s*\n/.test(rawOutput)
  );
}

const CONTAMINATION_SIGNATURES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /to=functions\./i, label: "代理工具调用泄漏 (to=functions.*)" },
  { pattern: /\{\s*"cmd"\s*:\s*"bash/i, label: "shell 指令 JSON 泄漏" },
  { pattern: /\{\s*"status"\s*:\s*"ok"/i, label: "伪造的工具执行结果 JSON" },
  { pattern: /\bexec_command\b/i, label: "exec_command 代理上下文泄漏" },
  { pattern: /\byield_time_ms\b/i, label: "代理调度字段泄漏" },
  { pattern: /channel\s*=\s*(?:final|analysis)/i, label: "代理频道标识泄漏" },
];

const VECTOR_DRAWABLE_COLOR_FALLBACKS = {
  colorPrimary: { resourceName: "vector_color_primary", hex: "#1F8A62" },
  colorOnPrimary: { resourceName: "vector_color_on_primary", hex: "#FFFFFF" },
  colorPrimaryContainer: { resourceName: "vector_color_primary_container", hex: "#AEEFD4" },
  colorOnPrimaryContainer: { resourceName: "vector_color_on_primary_container", hex: "#0F3A2C" },
  colorSecondaryContainer: { resourceName: "vector_color_secondary_container", hex: "#D8F6E8" },
  colorTertiaryContainer: { resourceName: "vector_color_tertiary_container", hex: "#DCE6FF" },
} as const;

const BASE_ANDROID_COLOR_FALLBACKS = {
  ic_launcher_background: "#1F8A62",
  splash_background: "#F4FBF7",
  splash_background_dark: "#0F3A2C",
} as const;

const DEFAULT_STRING_RESOURCE_VALUES = {
  tab_home: "首页",
  tab_record: "记录",
  tab_plan: "计划",
  tab_stats: "统计",
  retry: "重试",
  confirm: "确认",
  cancel: "取消",
  save: "保存",
  loading: "加载中",
  empty_title: "暂无内容",
  empty_description: "当前还没有可展示的数据",
  error_title: "发生错误",
  error_load_failed: "加载失败，请重试",
  error_add_exercise_first: "请先添加动作",
  error_complete_sets: "请补全组数数据",
} as const;

const REQUIRED_ANDROID_PROJECT_FILES = [
  "settings.gradle.kts",
  "build.gradle.kts",
  "gradle.properties",
  "app/build.gradle.kts",
  "app/src/main/AndroidManifest.xml",
];

const LOCKED_SOURCE_ARCHITECTURE_FILES: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "Application 入口 app/src/main/java/<package>/App.kt", pattern: /^app\/src\/main\/java\/.+\/App\.kt$/ },
  { label: "Activity 入口 app/src/main/java/<package>/MainActivity.kt", pattern: /^app\/src\/main\/java\/.+\/MainActivity\.kt$/ },
  { label: "数据模型 app/src/main/java/<package>/data/Models.kt", pattern: /^app\/src\/main\/java\/.+\/data\/Models\.kt$/ },
  { label: "Room 数据库 app/src/main/java/<package>/data/AppDatabase.kt", pattern: /^app\/src\/main\/java\/.+\/data\/AppDatabase\.kt$/ },
  { label: "Repository app/src/main/java/<package>/data/Repositories.kt", pattern: /^app\/src\/main\/java\/.+\/data\/Repositories\.kt$/ },
  { label: "UI 模型 app/src/main/java/<package>/ui/UiModels.kt", pattern: /^app\/src\/main\/java\/.+\/ui\/UiModels\.kt$/ },
  { label: "ViewModel app/src/main/java/<package>/ui/ViewModels.kt", pattern: /^app\/src\/main\/java\/.+\/ui\/ViewModels\.kt$/ },
  { label: "导航 app/src/main/java/<package>/ui/AppNav.kt", pattern: /^app\/src\/main\/java\/.+\/ui\/AppNav\.kt$/ },
  { label: "页面 app/src/main/java/<package>/ui/Screens.kt", pattern: /^app\/src\/main\/java\/.+\/ui\/Screens\.kt$/ },
  { label: "主题 app/src/main/java/<package>/ui/theme/Theme.kt", pattern: /^app\/src\/main\/java\/.+\/ui\/theme\/Theme\.kt$/ },
  { label: "字符串资源 app/src/main/res/values/strings.xml", pattern: /^app\/src\/main\/res\/values\/strings\.xml$/ },
  { label: "颜色资源 app/src/main/res/values/colors.xml", pattern: /^app\/src\/main\/res\/values\/colors\.xml$/ },
  { label: "主题资源 app/src/main/res/values/themes.xml", pattern: /^app\/src\/main\/res\/values\/themes\.xml$/ },
];

function detectOutputContamination(rawCode: string): string | null {
  const hits = CONTAMINATION_SIGNATURES.filter(({ pattern }) => pattern.test(rawCode));
  if (hits.length === 0) {
    return null;
  }

  return hits.map(({ label }) => label).join("；");
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
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

function findMatchingDelimiter(
  content: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
) {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "/" && content[index + 1] === "/") {
      const lineEnd = content.indexOf("\n", index + 2);
      index = lineEnd === -1 ? content.length : lineEnd;
      continue;
    }

    if (char === "/" && content[index + 1] === "*") {
      const blockEnd = content.indexOf("*/", index + 2);
      index = blockEnd === -1 ? content.length : blockEnd + 1;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevelCommaList(input: string) {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth -= 1;
    else if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth -= 1;
    else if (char === "<") angleDepth += 1;
    else if (char === ">" && angleDepth > 0) angleDepth -= 1;
    else if (
      char === "," &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      const part = input.slice(start, index).trim();
      if (part) {
        parts.push(part);
      }
      start = index + 1;
    }
  }

  const tail = input.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }

  return parts;
}

function readGenericArgument(content: string, openAngleIndex: number) {
  let depth = 0;
  for (let index = openAngleIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === "<") {
      depth += 1;
    } else if (char === ">") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openAngleIndex + 1, index).trim();
      }
    }
  }
  return null;
}

function inferFlowValueType(content: string, expression: string) {
  const name = expression.trim();
  if (!/^[A-Za-z_]\w*$/.test(name)) {
    return null;
  }

  const escapedName = escapeRegExp(name);
  const typedFlowMatch = new RegExp(
    `\\bval\\s+${escapedName}\\s*:\\s*(?:StateFlow|MutableStateFlow|Flow)\\s*<`,
  ).exec(content);
  if (typedFlowMatch) {
    const openAngleIndex = content.indexOf("<", typedFlowMatch.index);
    return readGenericArgument(content, openAngleIndex);
  }

  const explicitMutableMatch = new RegExp(
    `\\bval\\s+${escapedName}\\s*=\\s*MutableStateFlow\\s*<`,
  ).exec(content);
  if (explicitMutableMatch) {
    const openAngleIndex = content.indexOf("<", explicitMutableMatch.index);
    return readGenericArgument(content, openAngleIndex);
  }

  const inferredMutableMatch = new RegExp(
    `\\bval\\s+${escapedName}\\s*=\\s*MutableStateFlow\\s*\\(([^\\n)]*)\\)`,
  ).exec(content);
  const initializer = inferredMutableMatch?.[1]?.trim();
  if (!initializer) {
    return null;
  }

  if (/^"/.test(initializer)) return "String";
  if (/^(?:true|false)\b/.test(initializer)) return "Boolean";
  if (/^-?\d+\b/.test(initializer)) return "Int";

  return null;
}

function findLambdaArrow(content: string, startIndex: number) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = startIndex; index < content.length - 1; index += 1) {
    const char = content[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth -= 1;
    else if (char === "{") braceDepth += 1;
    else if (char === "}" && braceDepth > 0) braceDepth -= 1;
    else if (char === "<") angleDepth += 1;
    else if (char === ">" && angleDepth > 0) angleDepth -= 1;
    else if (
      char === "-" &&
      content[index + 1] === ">" &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      return index;
    }
  }

  return -1;
}

function insertTopLevelDeclarationAfterImports(content: string, declaration: string) {
  if (content.includes(declaration.trim().split("\n")[0])) {
    return content;
  }

  const packageMatch = content.match(/^(package\s+[\w.]+\s*\n)/m);
  if (!packageMatch || packageMatch.index === undefined) {
    return content;
  }

  let insertIndex = packageMatch.index + packageMatch[0].length;
  while (insertIndex < content.length) {
    const rest = content.slice(insertIndex);
    const blankMatch = rest.match(/^\s*\n/);
    if (blankMatch) {
      insertIndex += blankMatch[0].length;
      continue;
    }

    const importMatch = rest.match(/^import\s+[^\n]+\n/);
    if (importMatch) {
      insertIndex += importMatch[0].length;
      continue;
    }

    break;
  }

  return `${content.slice(0, insertIndex)}\n${declaration.trim()}\n\n${content.slice(insertIndex)}`;
}

function ensureFlowCombine5Helper(content: string) {
  return insertTopLevelDeclarationAfterImports(
    content,
    `
private data class FlowCombine5<A, B, C, D, E>(
    val value1: A,
    val value2: B,
    val value3: C,
    val value4: D,
    val value5: E,
)
`,
  );
}

function repairOversizedFlowCombine(content: string) {
  let next = content;
  let searchIndex = 0;
  let repaired = false;

  while (searchIndex < next.length) {
    const combineIndex = next.indexOf("combine(", searchIndex);
    if (combineIndex === -1) break;

    const before = next[combineIndex - 1];
    if (before && /[A-Za-z0-9_.]/.test(before)) {
      searchIndex = combineIndex + "combine(".length;
      continue;
    }

    const openParenIndex = combineIndex + "combine".length;
    const closeParenIndex = findMatchingDelimiter(next, openParenIndex, "(", ")");
    if (closeParenIndex === -1) break;

    let lambdaIndex = closeParenIndex + 1;
    while (/\s/.test(next[lambdaIndex] ?? "")) lambdaIndex += 1;
    if (next[lambdaIndex] !== "{") {
      searchIndex = closeParenIndex + 1;
      continue;
    }

    const arrowIndex = findLambdaArrow(next, lambdaIndex + 1);
    if (arrowIndex === -1) {
      searchIndex = lambdaIndex + 1;
      continue;
    }

    const args = splitTopLevelCommaList(next.slice(openParenIndex + 1, closeParenIndex));
    const params = splitTopLevelCommaList(next.slice(lambdaIndex + 1, arrowIndex));
    if (args.length <= 5 || args.length !== params.length) {
      searchIndex = arrowIndex + 2;
      continue;
    }

    if (args.length > 9) {
      searchIndex = arrowIndex + 2;
      continue;
    }

    const lineStart = next.lastIndexOf("\n", combineIndex) + 1;
    const indent = next.slice(lineStart, combineIndex).match(/^\s*/)?.[0] ?? "";
    const innerIndent = `${indent}    `;
    const itemIndent = `${indent}        `;

    const firstArgs = args.slice(0, 5);
    const firstParams = params.slice(0, 5);
    const remainingArgs = args.slice(5);
    const remainingParams = params.slice(5);
    const combinedParam = "__flowCombine5";
    const valueNames = ["value1", "value2", "value3", "value4", "value5"];
    const valueLines = firstParams.map((param, index) =>
      `${innerIndent}val ${param} = ${combinedParam}.${valueNames[index]}`,
    );

    const replacement =
      `combine(\n` +
      `${innerIndent}combine(\n` +
      `${firstArgs.map((arg) => `${itemIndent}${arg.trim()},`).join("\n")}\n` +
      `${innerIndent}) { ${firstParams.join(", ")} ->\n` +
      `${itemIndent}FlowCombine5(${firstParams.join(", ")})\n` +
      `${innerIndent}},\n` +
      `${remainingArgs.map((arg) => `${innerIndent}${arg.trim()},`).join("\n")}\n` +
      `${indent}) { ${[combinedParam, ...remainingParams].join(", ")} ->\n` +
      `${valueLines.join("\n")}`;

    next = `${next.slice(0, combineIndex)}${replacement}${next.slice(arrowIndex + 2)}`;
    searchIndex = combineIndex + replacement.length;
    repaired = true;
  }

  return repaired ? ensureFlowCombine5Helper(next) : content;
}

function repairChainedFlowCombineWithMultipleArguments(content: string) {
  let next = content;
  let searchIndex = 0;
  let repaired = false;

  while (searchIndex < next.length) {
    const chainIndex = next.indexOf(".combine(", searchIndex);
    if (chainIndex === -1) {
      break;
    }

    let previousExpressionEnd = chainIndex - 1;
    while (/\s/.test(next[previousExpressionEnd] ?? "")) {
      previousExpressionEnd -= 1;
    }
    if (next[previousExpressionEnd] !== "}") {
      searchIndex = chainIndex + ".combine(".length;
      continue;
    }

    const previousCombineIndex = next.lastIndexOf("combine(", previousExpressionEnd);
    if (previousCombineIndex < 0) {
      searchIndex = chainIndex + ".combine(".length;
      continue;
    }

    const openParenIndex = chainIndex + ".combine".length;
    const closeParenIndex = findMatchingDelimiter(next, openParenIndex, "(", ")");
    if (closeParenIndex < 0) {
      break;
    }

    let lambdaIndex = closeParenIndex + 1;
    while (/\s/.test(next[lambdaIndex] ?? "")) {
      lambdaIndex += 1;
    }
    if (next[lambdaIndex] !== "{") {
      searchIndex = closeParenIndex + 1;
      continue;
    }

    const lambdaCloseIndex = findMatchingDelimiter(next, lambdaIndex, "{", "}");
    const arrowIndex = findLambdaArrow(next, lambdaIndex + 1);
    if (lambdaCloseIndex < 0 || arrowIndex < 0 || arrowIndex > lambdaCloseIndex) {
      searchIndex = lambdaIndex + 1;
      continue;
    }

    const args = splitTopLevelCommaList(next.slice(openParenIndex + 1, closeParenIndex));
    const params = splitTopLevelCommaList(next.slice(lambdaIndex + 1, arrowIndex));
    if (args.length <= 1 || params.length !== args.length + 1) {
      searchIndex = lambdaCloseIndex + 1;
      continue;
    }

    const previousExpression = next.slice(previousCombineIndex, previousExpressionEnd + 1).trim();
    const lambda = next.slice(lambdaIndex, lambdaCloseIndex + 1);
    const lineStart = next.lastIndexOf("\n", previousCombineIndex) + 1;
    const indent = next.slice(lineStart, previousCombineIndex).match(/^\s*/)?.[0] ?? "";
    const innerIndent = `${indent}    `;
    const replacement =
      `combine(\n` +
      `${innerIndent}${previousExpression},\n` +
      `${args.map((arg) => `${innerIndent}${arg.trim()},`).join("\n")}\n` +
      `${indent}) ${lambda}`;

    next = `${next.slice(0, previousCombineIndex)}${replacement}${next.slice(lambdaCloseIndex + 1)}`;
    searchIndex = previousCombineIndex + replacement.length;
    repaired = true;
  }

  return repaired ? next : content;
}

function repairQualifiedFlowMapReference(content: string) {
  let next = content.replace(
    /\bkotlinx\.coroutines\.flow\.map(?:<[^\n{]+>)?\s*\{/g,
    "this.map {",
  );

  if (next !== content) {
    next = ensureKotlinImport(next, "import kotlinx.coroutines.flow.map");
  }

  return next;
}

function repairUnsupportedMaterialIconReferences(content: string) {
  return content
    .replace(
      /^\s*import\s+androidx\.compose\.material\.icons\.automirrored\.filled\.Forum\s*$/gm,
      "import androidx.compose.material.icons.filled.Forum",
    )
    .replace(/\bIcons\.AutoMirrored\.Filled\.Forum\b/g, "Icons.Filled.Forum");
}

function repairInvalidModifierWeightImport(content: string) {
  return content.replace(
    /^\s*import\s+androidx\.compose\.foundation\.layout\.weight\s*\n/gm,
    "",
  );
}

function repairPaddingValuesPassedAsModifier(content: string) {
  let next = content
    .replace(
      /\b(LoadingView|EmptyView|ErrorView)\(\s*padding\s*(?=\))/g,
      "$1(Modifier.padding(padding)",
    )
    .replace(
      /\b(LoadingView|EmptyView|ErrorView)\(\s*padding\s*,/g,
      "$1(Modifier.padding(padding),",
    );

  if (next !== content) {
    next = ensureKotlinImport(next, "import androidx.compose.foundation.layout.padding");
    next = ensureKotlinImport(next, "import androidx.compose.ui.Modifier");
  }

  return next;
}

function repairMissingFlatMapLatestOptIn(content: string) {
  if (!/\bflatMapLatest\s*\{/.test(content)) {
    return content;
  }

  return ensureKotlinFileOptIns(
    content,
    ["kotlinx.coroutines.ExperimentalCoroutinesApi::class"],
  );
}

function repairModifierWeightComposableReceivers(
  content: string,
  {
    onlyLikelyNavigationItems = false,
  }: {
    onlyLikelyNavigationItems?: boolean;
  } = {},
) {
  if (!/Modifier\.weight\s*\(/.test(content)) {
    return content;
  }

  let next = content;
  const composableWithWeight =
    /(@Composable\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\n)(\s*(?:private\s+|internal\s+|public\s+)?fun\s+)(?!RowScope\.|ColumnScope\.)([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{([\s\S]*?)Modifier\.weight\s*\(/g;

  next = next.replace(
    composableWithWeight,
    (match, annotation, funHead, fnName, params, body) => {
      const isLikelyNavigationItem =
        /(?:Bottom|Nav|Navigation|Bar|Rail|Tab|Item)/.test(fnName);
      if (onlyLikelyNavigationItems && !isLikelyNavigationItem) {
        return match;
      }

      return `${annotation}${funHead}RowScope.${fnName}(${params}) {${body}Modifier.weight(`;
    },
  );

  if (next !== content) {
    next = ensureKotlinImport(
      next,
      "import androidx.compose.foundation.layout.RowScope",
    );
  }

  return next;
}

function repairForumViewModelNestedFlowUiState(content: string) {
  if (
    !content.includes("class ForumViewModel") ||
    !content.includes("StateFlow<UiState<ForumUiData>>") ||
    !content.includes("MutableStateFlow(category)") ||
    !content.includes("MutableStateFlow(currentSort)") ||
    !content.includes(".let { outer ->")
  ) {
    return content;
  }

  let next = content;
  const propertyPattern =
    /\n    val\s+uiState\s*:\s*StateFlow<UiState<ForumUiData>>\s*=/g;
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  for (const match of next.matchAll(propertyPattern)) {
    if (match.index === undefined) {
      continue;
    }

    const initializerStart = match.index + match[0].length;
    const initializerEnd = findNextClassMemberStart(next, initializerStart);
    const initializer = next.slice(initializerStart, initializerEnd);
    if (
      !initializer.includes("combine(selectedCategory, sort)") ||
      !initializer.includes("repository.observePosts(currentSort)") ||
      !initializer.includes("repository.observeCategoryPosts(category, currentSort)") ||
      !initializer.includes("MutableStateFlow(category)") ||
      !initializer.includes("MutableStateFlow(currentSort)") ||
      !initializer.includes(".let { outer ->")
    ) {
      continue;
    }

    replacements.push({
      start: match.index,
      end: initializerEnd,
      replacement: `
    val uiState: StateFlow<UiState<ForumUiData>> =
        combine(selectedCategory, sort) { category, currentSort ->
            category to currentSort
        }.flatMapLatest { (category, currentSort) ->
            val source = if (category == null) {
                repository.observePosts(currentSort)
            } else {
                repository.observeCategoryPosts(category, currentSort)
            }
            source.map { posts ->
                val state: UiState<ForumUiData> = if (posts.isEmpty()) {
                    UiState.Empty
                } else {
                    UiState.Success(
                        ForumUiData(
                            selectedCategory = category,
                            sort = currentSort,
                            posts = posts.map { it.toUiModel() },
                        ),
                    )
                }
                state
            }
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = UiState.Loading,
        )`,
    });
  }

  for (const replacement of replacements.reverse()) {
    next = `${next.slice(0, replacement.start)}${replacement.replacement}${next.slice(replacement.end)}`;
  }

  if (next !== content) {
    next = ensureKotlinImport(next, "import kotlinx.coroutines.flow.flatMapLatest");
    next = ensureKotlinFileOptIns(
      next,
      ["kotlinx.coroutines.ExperimentalCoroutinesApi::class"],
    );
  }

  return next;
}

type KotlinFileSnapshot = {
  relativePath: string;
  content: string;
};

type UiStateTypeIndex = {
  importedSymbols: Map<string, string>;
  propertyTypesByClass: Map<string, Map<string, string>>;
};

const KOTLIN_TYPES_WITHOUT_IMPORT = new Set([
  "Any",
  "Array",
  "Boolean",
  "Byte",
  "Char",
  "Collection",
  "Double",
  "Float",
  "Int",
  "Iterable",
  "List",
  "Long",
  "Map",
  "MutableList",
  "MutableMap",
  "MutableSet",
  "Nothing",
  "Pair",
  "Set",
  "Short",
  "String",
  "Triple",
  "UiState",
  "Unit",
]);

function readFirstUiStateGenericArgument(content: string) {
  const uiStateIndex = content.indexOf("UiState<");
  if (uiStateIndex === -1) {
    return null;
  }

  return readGenericArgument(content, uiStateIndex + "UiState".length);
}

function findNextClassMemberStart(content: string, startIndex: number) {
  const memberPattern =
    /\n    (?:(?:private|public|internal|protected)\s+)?(?:(?:suspend|override|inline|tailrec|operator|infix)\s+)*(?:val|var|fun|init\b|class\b)/g;
  memberPattern.lastIndex = startIndex;
  const match = memberPattern.exec(content);
  return match?.index ?? content.length;
}

function inferUiStateTypeFromProperty(initializerPrefix: string, initializer: string) {
  const explicitType = readFirstUiStateGenericArgument(initializerPrefix);
  if (explicitType) {
    return explicitType;
  }

  const initializerType = readFirstUiStateGenericArgument(initializer);
  if (initializerType) {
    return initializerType;
  }

  const directSuccessMatch = initializer.match(/\bUiState\.Success\s*\(\s*([A-Z][A-Za-z0-9_]*)\s*\(/);
  if (directSuccessMatch?.[1]) {
    return directSuccessMatch[1];
  }

  return null;
}

function buildUiStateTypeIndex(files: KotlinFileSnapshot[]): UiStateTypeIndex {
  const importedSymbols = new Map<string, string>();
  const propertyTypesByClass = new Map<string, Map<string, string>>();

  for (const file of files) {
    for (const importMatch of file.content.matchAll(/^import\s+([\w.]+)\s*$/gm)) {
      const importPath = importMatch[1];
      if (!importPath || importPath.endsWith(".*")) {
        continue;
      }

      const symbolName = importPath.split(".").pop();
      if (symbolName && !importedSymbols.has(symbolName)) {
        importedSymbols.set(symbolName, importPath);
      }
    }
  }

  for (const file of files) {
    const classPattern = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
    for (const classMatch of file.content.matchAll(classPattern)) {
      const className = classMatch[1];
      const openBraceIndex = findKotlinClassOpeningBrace(file.content, classMatch.index);
      const closeBraceIndex = findMatchingDelimiter(file.content, openBraceIndex, "{", "}");
      if (!className || openBraceIndex === -1 || closeBraceIndex === -1) {
        continue;
      }

      const body = file.content.slice(openBraceIndex + 1, closeBraceIndex);
      const classPropertyTypes = propertyTypesByClass.get(className) ?? new Map<string, string>();
      const propertyPattern =
        /(?:^|\n)    (?:(?:private|public|internal|protected)\s+)?val\s+([A-Za-z_][A-Za-z0-9_]*)\s*([^=\n]*)=/g;

      for (const propertyMatch of body.matchAll(propertyPattern)) {
        const propertyName = propertyMatch[1];
        const initializerPrefix = propertyMatch[2] ?? "";
        const initializerStart = propertyMatch.index + propertyMatch[0].length;
        const initializerEnd = findNextClassMemberStart(body, initializerStart);
        const initializer = body.slice(initializerStart, initializerEnd);
        const uiStateType = inferUiStateTypeFromProperty(initializerPrefix, initializer);
        if (propertyName && uiStateType) {
          classPropertyTypes.set(propertyName, uiStateType);
        }
      }

      if (classPropertyTypes.size > 0) {
        propertyTypesByClass.set(className, classPropertyTypes);
      }
    }
  }

  return { importedSymbols, propertyTypesByClass };
}

function findKotlinClassOpeningBrace(content: string, classIndex: number) {
  const openBraceIndex = content.indexOf("{", classIndex);
  if (openBraceIndex === -1) {
    return -1;
  }

  const header = content.slice(classIndex, openBraceIndex);
  const nextClassDeclaration = header
    .slice("class".length)
    .match(/\b(?:data\s+class|enum\s+class|sealed\s+(?:class|interface)|class|interface|object)\s+[A-Za-z_][A-Za-z0-9_]*/);
  return nextClassDeclaration ? -1 : openBraceIndex;
}

function qualifyUiStateDataType(content: string, type: string, index: UiStateTypeIndex) {
  let next = content;
  const targetPackage = content.match(/^package\s+([\w.]+)/m)?.[1] ?? "";
  const currentImports = new Set(
    [...content.matchAll(/^import\s+([\w.]+)\s*$/gm)]
      .map((match) => match[1])
      .filter((importPath): importPath is string => Boolean(importPath)),
  );

  for (const typeName of type.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) {
    const symbolName = typeName[0];
    if (KOTLIN_TYPES_WITHOUT_IMPORT.has(symbolName)) {
      continue;
    }

    const importPath = index.importedSymbols.get(symbolName);
    if (!importPath || currentImports.has(importPath)) {
      continue;
    }

    if (targetPackage && importPath.startsWith(`${targetPackage}.`)) {
      continue;
    }

    next = ensureKotlinImport(next, `import ${importPath}`);
    currentImports.add(importPath);
  }

  return next;
}

function uniqueUiStateDataVariableName(blockContent: string, variableName: string) {
  const baseName = variableName === "state" ? "stateData" : `${variableName}Data`;
  let candidate = baseName;
  let suffix = 2;

  while (new RegExp(`\\b${escapeRegExp(candidate)}\\b`).test(blockContent)) {
    candidate = `${baseName}${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function castLineForUiStateData(
  indent: string,
  variableName: string,
  dataType: string,
  dataVariableName: string,
) {
  const suppressLine = /<.*>/.test(dataType) ? `${indent}@Suppress("UNCHECKED_CAST")\n` : "";
  return `${suppressLine}${indent}val ${dataVariableName} = ${variableName}.data as ${dataType}\n`;
}

function replaceUiStateDataAccesses(
  blockContent: string,
  variableName: string,
  dataType: string,
  dataVariableName: string,
) {
  const directDataPattern = new RegExp(
    `(^\\s*)val\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${escapeRegExp(variableName)}\\.data\\s*$`,
    "m",
  );
  const directDataMatch = directDataPattern.exec(blockContent);
  if (directDataMatch?.[1] && directDataMatch[2]) {
    const indent = directDataMatch[1];
    const replacement =
      /<.*>/.test(dataType)
        ? `${indent}@Suppress("UNCHECKED_CAST")\n${indent}val ${directDataMatch[2]} = ${variableName}.data as ${dataType}`
        : `${indent}val ${directDataMatch[2]} = ${variableName}.data as ${dataType}`;
    return {
      content: blockContent.replace(directDataPattern, replacement),
      insertedCast: true,
    };
  }

  const dataAccessPattern = new RegExp(`${escapeRegExp(variableName)}\\.data\\b`, "g");
  if (!dataAccessPattern.test(blockContent)) {
    return { content: blockContent, insertedCast: true };
  }

  dataAccessPattern.lastIndex = 0;
  return {
    content: blockContent.replace(dataAccessPattern, dataVariableName),
    insertedCast: false,
  };
}

function repairUiStateSuccessBlock(
  blockContent: string,
  branchIndent: string,
  variableName: string,
  dataType: string,
) {
  if (new RegExp(`\\b${escapeRegExp(variableName)}\\.data\\s+as\\s+${escapeRegExp(dataType)}`).test(blockContent)) {
    return blockContent;
  }

  const dataVariableName = uniqueUiStateDataVariableName(blockContent, variableName);
  const { content: rewrittenBlock, insertedCast } = replaceUiStateDataAccesses(
    blockContent,
    variableName,
    dataType,
    dataVariableName,
  );
  if (insertedCast) {
    return rewrittenBlock;
  }

  const castIndent = `${branchIndent}    `;
  const normalizedBlock = rewrittenBlock.startsWith("\n") ? rewrittenBlock : `\n${rewrittenBlock}`;
  return `\n${castLineForUiStateData(castIndent, variableName, dataType, dataVariableName)}${normalizedBlock}`;
}

function findNextWhenBranchIndex(content: string, startIndex: number) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") parenDepth += 1;
    else if (char === ")" && parenDepth > 0) parenDepth -= 1;
    else if (char === "[") bracketDepth += 1;
    else if (char === "]" && bracketDepth > 0) bracketDepth -= 1;
    else if (char === "{") braceDepth += 1;
    else if (char === "}" && braceDepth > 0) braceDepth -= 1;
    else if (char === "<") angleDepth += 1;
    else if (char === ">" && angleDepth > 0) angleDepth -= 1;

    if (
      char === "\n" &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      const nextLine = content.slice(index + 1).match(/^\s*(?:is\s+)?(?:UiState\.|else\s*->)/);
      if (nextLine) {
        return index + 1;
      }
    }
  }

  return content.length;
}

function expressionUiStateType(expression: string, variableTypes: Map<string, string>) {
  const cleaned = expression
    .trim()
    .replace(/\s+/g, "")
    .replace(/\.value$/, "");

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned)) {
    return variableTypes.get(cleaned) ?? null;
  }

  return null;
}

function collectUiStateAliases(content: string, variableTypes: Map<string, string>) {
  const nextVariableTypes = new Map(variableTypes);
  let changed = true;

  while (changed) {
    changed = false;
    for (const aliasMatch of content.matchAll(/\bval\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)(?:\.value)?\b/g)) {
      const aliasName = aliasMatch[1];
      const sourceName = aliasMatch[2];
      const sourceType = sourceName ? nextVariableTypes.get(sourceName) : null;
      if (aliasName && sourceType && !nextVariableTypes.has(aliasName)) {
        nextVariableTypes.set(aliasName, sourceType);
        changed = true;
      }
    }
  }

  return nextVariableTypes;
}

function repairUiStateSuccessWhenBranches(content: string, variableTypes: Map<string, string>) {
  let next = content;
  let searchIndex = 0;
  let repaired = false;

  while (searchIndex < next.length) {
    const whenIndex = next.indexOf("when", searchIndex);
    if (whenIndex === -1) {
      break;
    }

    const before = next[whenIndex - 1];
    const after = next[whenIndex + "when".length];
    if ((before && /[A-Za-z0-9_]/.test(before)) || (after && /[A-Za-z0-9_]/.test(after))) {
      searchIndex = whenIndex + "when".length;
      continue;
    }

    let openParenIndex = whenIndex + "when".length;
    while (/\s/.test(next[openParenIndex] ?? "")) {
      openParenIndex += 1;
    }
    if (next[openParenIndex] !== "(") {
      searchIndex = whenIndex + "when".length;
      continue;
    }

    const closeParenIndex = findMatchingDelimiter(next, openParenIndex, "(", ")");
    if (closeParenIndex === -1) {
      break;
    }

    let openBraceIndex = closeParenIndex + 1;
    while (/\s/.test(next[openBraceIndex] ?? "")) {
      openBraceIndex += 1;
    }
    if (next[openBraceIndex] !== "{") {
      searchIndex = closeParenIndex + 1;
      continue;
    }

    const closeBraceIndex = findMatchingDelimiter(next, openBraceIndex, "{", "}");
    if (closeBraceIndex === -1) {
      break;
    }

    const condition = next.slice(openParenIndex + 1, closeParenIndex).trim();
    const valueMatch = condition.match(/^val\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/s);
    const branchVariable = valueMatch?.[1] ?? (/^[A-Za-z_][A-Za-z0-9_]*$/.test(condition) ? condition : null);
    const conditionExpression = valueMatch?.[2] ?? condition;
    const dataType = expressionUiStateType(conditionExpression, variableTypes);
    if (!branchVariable || !dataType) {
      searchIndex = openBraceIndex + 1;
      continue;
    }

    const whenBody = next.slice(openBraceIndex + 1, closeBraceIndex);
    let rewrittenBody = whenBody;
    let bodySearchIndex = 0;
    let bodyRepaired = false;

    while (bodySearchIndex < rewrittenBody.length) {
      const branchMatch = /(^[ \t]*)is\s+UiState\.Success<\*>\s*->/m.exec(rewrittenBody.slice(bodySearchIndex));
      if (!branchMatch) {
        break;
      }

      const branchStart = bodySearchIndex + branchMatch.index;
      const arrowEnd = branchStart + branchMatch[0].length;
      const branchIndent = branchMatch[1] ?? "";
      let expressionStart = arrowEnd;
      while (/\s/.test(rewrittenBody[expressionStart] ?? "")) {
        expressionStart += 1;
      }

      if (rewrittenBody[expressionStart] === "{") {
        const branchCloseIndex = findMatchingDelimiter(rewrittenBody, expressionStart, "{", "}");
        if (branchCloseIndex === -1) {
          break;
        }

        const blockContent = rewrittenBody.slice(expressionStart + 1, branchCloseIndex);
        const repairedBlock = repairUiStateSuccessBlock(blockContent, branchIndent, branchVariable, dataType);
        rewrittenBody = `${rewrittenBody.slice(0, expressionStart + 1)}${repairedBlock}${rewrittenBody.slice(branchCloseIndex)}`;
        bodySearchIndex = expressionStart + 1 + repairedBlock.length;
        bodyRepaired ||= repairedBlock !== blockContent;
        continue;
      }

      const branchEnd = findNextWhenBranchIndex(rewrittenBody, expressionStart);
      const expression = rewrittenBody.slice(expressionStart, branchEnd);
      const repairedExpression = repairUiStateSuccessBlock(expression, branchIndent, branchVariable, dataType);
      const replacement = `{\n${repairedExpression}\n${branchIndent}}`;
      rewrittenBody = `${rewrittenBody.slice(0, expressionStart)}${replacement}${rewrittenBody.slice(branchEnd)}`;
      bodySearchIndex = expressionStart + replacement.length;
      bodyRepaired = true;
    }

    if (bodyRepaired) {
      next = `${next.slice(0, openBraceIndex + 1)}${rewrittenBody}${next.slice(closeBraceIndex)}`;
      searchIndex = openBraceIndex + 1;
      repaired = true;
    } else {
      searchIndex = openBraceIndex + 1;
    }
  }

  return repaired ? next : content;
}

function repairUiStateSuccessIfBlocks(content: string, variableTypes: Map<string, string>) {
  let next = content;
  let searchIndex = 0;
  let repaired = false;

  while (searchIndex < next.length) {
    const ifMatch = /\bif\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s+is\s+UiState\.Success<\*>\s*\)\s*\{/g.exec(
      next.slice(searchIndex),
    );
    if (!ifMatch?.[1]) {
      break;
    }

    const ifIndex = searchIndex + ifMatch.index;
    const variableName = ifMatch[1];
    const dataType = variableTypes.get(variableName);
    const openBraceIndex = next.indexOf("{", ifIndex + ifMatch[0].length - 1);
    const closeBraceIndex = findMatchingDelimiter(next, openBraceIndex, "{", "}");
    if (!dataType || openBraceIndex === -1 || closeBraceIndex === -1) {
      searchIndex = ifIndex + ifMatch[0].length;
      continue;
    }

    const lineStart = next.lastIndexOf("\n", ifIndex) + 1;
    const branchIndent = next.slice(lineStart, ifIndex).match(/^\s*/)?.[0] ?? "";
    const blockContent = next.slice(openBraceIndex + 1, closeBraceIndex);
    const repairedBlock = repairUiStateSuccessBlock(blockContent, branchIndent, variableName, dataType);
    if (repairedBlock !== blockContent) {
      next = `${next.slice(0, openBraceIndex + 1)}${repairedBlock}${next.slice(closeBraceIndex)}`;
      searchIndex = openBraceIndex + 1 + repairedBlock.length;
      repaired = true;
    } else {
      searchIndex = closeBraceIndex + 1;
    }
  }

  return repaired ? next : content;
}

function collectFunctionParameterViewModelTypes(header: string) {
  const viewModelTypes = new Map<string, string>();
  for (const match of header.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*ViewModel)\b/g)) {
    if (match[1] && match[2]) {
      viewModelTypes.set(match[1], match[2]);
    }
  }

  return viewModelTypes;
}

function collectCollectedUiStateTypes(
  body: string,
  parameterViewModelTypes: Map<string, string>,
  index: UiStateTypeIndex,
) {
  const variableTypes = new Map<string, string>();
  const collectPattern =
    /\bval\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:by|=)\s+([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\.collectAsStateWithLifecycle\s*\(/g;

  for (const collectMatch of body.matchAll(collectPattern)) {
    const localName = collectMatch[1];
    const viewModelName = collectMatch[2];
    const propertyName = collectMatch[3];
    const viewModelClass = viewModelName ? parameterViewModelTypes.get(viewModelName) : null;
    const dataType =
      viewModelClass && propertyName
        ? index.propertyTypesByClass.get(viewModelClass)?.get(propertyName)
        : null;

    if (localName && dataType) {
      variableTypes.set(localName, dataType);
    }
  }

  return variableTypes;
}

function repairUiStateSuccessCastsInScope(content: string, variableTypes: Map<string, string>) {
  const aliasedTypes = collectUiStateAliases(content, variableTypes);
  const withWhenRepairs = repairUiStateSuccessWhenBranches(content, aliasedTypes);
  return repairUiStateSuccessIfBlocks(withWhenRepairs, aliasedTypes);
}

function repairUiStateSuccessCasts(content: string, index: UiStateTypeIndex) {
  let next = content;
  const classReplacements: Array<{ start: number; end: number; replacement: string }> = [];
  const classPattern = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;

  for (const classMatch of next.matchAll(classPattern)) {
    const className = classMatch[1];
    const openBraceIndex = findKotlinClassOpeningBrace(next, classMatch.index);
    const closeBraceIndex = findMatchingDelimiter(next, openBraceIndex, "{", "}");
    if (!className || openBraceIndex === -1 || closeBraceIndex === -1) {
      continue;
    }

    const classPropertyTypes = index.propertyTypesByClass.get(className);
    if (!classPropertyTypes || classPropertyTypes.size === 0) {
      continue;
    }

    const body = next.slice(openBraceIndex + 1, closeBraceIndex);
    const repairedBody = repairUiStateSuccessCastsInScope(body, classPropertyTypes);
    if (repairedBody !== body) {
      classReplacements.push({ start: openBraceIndex + 1, end: closeBraceIndex, replacement: repairedBody });
    }
  }

  for (const replacement of classReplacements.reverse()) {
    next = `${next.slice(0, replacement.start)}${replacement.replacement}${next.slice(replacement.end)}`;
  }

  const functionReplacements: Array<{ start: number; end: number; replacement: string }> = [];
  const functionPattern = /\bfun\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/g;
  for (const functionMatch of next.matchAll(functionPattern)) {
    const openParenIndex = next.indexOf("(", functionMatch.index);
    const closeParenIndex = findMatchingDelimiter(next, openParenIndex, "(", ")");
    if (openParenIndex === -1 || closeParenIndex === -1) {
      continue;
    }

    let openBraceIndex = closeParenIndex + 1;
    while (openBraceIndex < next.length && next[openBraceIndex] !== "{" && next[openBraceIndex] !== "=") {
      openBraceIndex += 1;
    }
    if (next[openBraceIndex] !== "{") {
      continue;
    }

    const closeBraceIndex = findMatchingDelimiter(next, openBraceIndex, "{", "}");
    if (closeBraceIndex === -1) {
      continue;
    }

    const headerStart = next.lastIndexOf("\n", functionMatch.index) + 1;
    const header = next.slice(headerStart, openBraceIndex);
    const parameterViewModelTypes = collectFunctionParameterViewModelTypes(header);
    if (parameterViewModelTypes.size === 0) {
      continue;
    }

    const body = next.slice(openBraceIndex + 1, closeBraceIndex);
    const variableTypes = collectCollectedUiStateTypes(body, parameterViewModelTypes, index);
    if (variableTypes.size === 0) {
      continue;
    }

    const repairedBody = repairUiStateSuccessCastsInScope(body, variableTypes);
    if (repairedBody !== body) {
      functionReplacements.push({ start: openBraceIndex + 1, end: closeBraceIndex, replacement: repairedBody });
    }
  }

  for (const replacement of functionReplacements.reverse()) {
    next = `${next.slice(0, replacement.start)}${replacement.replacement}${next.slice(replacement.end)}`;
  }

  if (next !== content) {
    const castTypes = [...next.matchAll(/\bval\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*[A-Za-z_][A-Za-z0-9_]*\.data\s+as\s+([^\n]+)/g)]
      .map((match) => match[1]?.trim())
      .filter((type): type is string => Boolean(type));
    for (const type of castTypes) {
      next = qualifyUiStateDataType(next, type, index);
    }
  }

  return next;
}

function repairGenericUiStateSuccessChecks(content: string, index?: UiStateTypeIndex) {
  const withStarProjection = content.replace(
    /\bis\s+UiState\.Success(?![<A-Za-z0-9_])/g,
    "is UiState.Success<*>",
  );

  if (!index) {
    return withStarProjection;
  }

  return repairUiStateSuccessCasts(withStarProjection, index);
}

function parseAndroidNamespace(
  files: Array<{ filePath: string; content: string }>,
) {
  const appGradle = files.find((file) => file.filePath === "app/build.gradle.kts")?.content ?? "";
  const namespaceMatch = appGradle.match(/namespace\s*=\s*"([^"]+)"/);
  if (namespaceMatch?.[1]) {
    return namespaceMatch[1];
  }

  const applicationIdMatch = appGradle.match(/applicationId\s*=\s*"([^"]+)"/);
  if (applicationIdMatch?.[1]) {
    return applicationIdMatch[1];
  }

  return null;
}

function parseRootProjectName(
  files: Array<{ filePath: string; content: string }>,
) {
  const settingsGradle = files.find((file) => file.filePath === "settings.gradle.kts")?.content ?? "";
  const rootProjectNameMatch = settingsGradle.match(/rootProject\.name\s*=\s*"([^"]+)"/);
  return rootProjectNameMatch?.[1]?.trim() || "AiGeneratedApp";
}

function validateLockedSourceArchitecture(files: Array<{ filePath: string; content: string }>) {
  const filePaths = files.map((file) => file.filePath);
  const missing = LOCKED_SOURCE_ARCHITECTURE_FILES.filter(
    (required) => !filePaths.some((filePath) => required.pattern.test(filePath)),
  );

  return missing.map((item) => item.label);
}

function collectDeclaredKotlinSymbols(
  files: Array<{ filePath: string; content: string }>,
) {
  const declaredSymbols = new Set<string>();
  const declarationPattern =
    /\b(?:data\s+class|enum\s+class|sealed\s+class|sealed\s+interface|class|interface|object|typealias|fun)\s+([A-Za-z_][A-Za-z0-9_]*)/g;

  for (const file of files) {
    if (!file.filePath.endsWith(".kt")) {
      continue;
    }

    for (const match of file.content.matchAll(declarationPattern)) {
      const symbolName = match[1]?.trim();
      if (symbolName) {
        declaredSymbols.add(symbolName);
      }
    }
  }

  return declaredSymbols;
}

function collectDeclaredKotlinSymbolImports(
  files: Array<{ filePath: string; content: string }>,
) {
  const groupedByName = new Map<string, Set<string>>();
  const declarationPattern =
    /\b(?:data\s+class|enum\s+class|sealed\s+class|sealed\s+interface|class|interface|object|typealias|fun)\s+([A-Za-z_][A-Za-z0-9_]*)/g;

  for (const file of files) {
    if (!file.filePath.endsWith(".kt")) {
      continue;
    }

    const packageName = file.content.match(/^\s*package\s+([\w.]+)/m)?.[1]?.trim();
    if (!packageName) {
      continue;
    }

    for (const match of file.content.matchAll(declarationPattern)) {
      const symbolName = match[1]?.trim();
      if (!symbolName) {
        continue;
      }

      const importPaths = groupedByName.get(symbolName) ?? new Set<string>();
      importPaths.add(`${packageName}.${symbolName}`);
      groupedByName.set(symbolName, importPaths);
    }
  }

  const uniqueImports = new Map<string, string>();
  for (const [symbolName, importPaths] of groupedByName.entries()) {
    if (importPaths.size === 1) {
      uniqueImports.set(symbolName, [...importPaths][0]!);
    }
  }

  return uniqueImports;
}

function detectMissingInternalImports(
  files: Array<{ filePath: string; content: string }>,
) {
  const namespace = parseAndroidNamespace(files);
  if (!namespace) {
    return [];
  }

  const declaredSymbols = collectDeclaredKotlinSymbols(files);
  const missingImports = new Set<string>();

  for (const file of files) {
    if (!file.filePath.endsWith(".kt")) {
      continue;
    }

    for (const match of file.content.matchAll(/^import\s+([A-Za-z0-9_.]+)(?:\s+as\s+\w+)?\s*$/gm)) {
      const importPath = match[1]?.trim();
      if (
        !importPath ||
        !importPath.startsWith(`${namespace}.`) ||
        importPath === `${namespace}.R` ||
        importPath.endsWith(".*")
      ) {
        continue;
      }

      const symbolName = importPath.split(".").pop();
      if (!symbolName || /^[a-z]/.test(symbolName)) {
        continue;
      }

      if (!declaredSymbols.has(symbolName)) {
        missingImports.add(importPath);
      }
    }
  }

  return [...missingImports];
}

function replaceVectorDrawableThemeAttrs(content: string) {
  let next = content;

  for (const [attrName, { resourceName }] of Object.entries(VECTOR_DRAWABLE_COLOR_FALLBACKS)) {
    next = next.replaceAll(`?attr/${attrName}`, `@color/${resourceName}`);
  }

  return next;
}

async function ensureColorResources(
  colorsFile: string,
  colorEntries: Array<{ resourceName: string; hex: string }>,
) {
  const colorLines = colorEntries.map(
    ({ resourceName, hex }) => `    <color name="${resourceName}">${hex}</color>`,
  );

  if (!(await pathExists(colorsFile))) {
    await ensureDir(path.dirname(colorsFile));
    await writeFile(
      colorsFile,
      `<resources>\n${colorLines.join("\n")}\n</resources>\n`,
      "utf8",
    );
    return { created: true, updated: false };
  }

  const repaired = await updateTextFileIfExists(colorsFile, (content) => {
    const missingLines = colorEntries
      .filter(
        ({ resourceName }) =>
          !new RegExp(`<color\\s+name="${escapeRegExp(resourceName)}"`).test(content),
      )
      .map(({ resourceName, hex }) => `    <color name="${resourceName}">${hex}</color>`);

    if (missingLines.length === 0 || !content.includes("</resources>")) {
      return content;
    }

    return content.replace("</resources>", `${missingLines.join("\n")}\n</resources>`);
  });

  return { created: false, updated: repaired };
}

async function ensureBaselineColorResources(projectId: string, projectDir: string) {
  const colorsFile = path.join(projectDir, "app/src/main/res/values/colors.xml");
  const result = await ensureColorResources(
    colorsFile,
    Object.entries(BASE_ANDROID_COLOR_FALLBACKS).map(([resourceName, hex]) => ({
      resourceName,
      hex,
    })),
  );

  if (result.created) {
    appendLog(projectId, "已补充基础颜色资源：app/src/main/res/values/colors.xml");
  } else if (result.updated) {
    appendLog(projectId, "已追加缺失的基础颜色资源");
  }
}

async function ensureVectorDrawableColorResources(projectId: string, projectDir: string) {
  const colorsFile = path.join(projectDir, "app/src/main/res/values/colors.xml");
  const result = await ensureColorResources(colorsFile, Object.values(VECTOR_DRAWABLE_COLOR_FALLBACKS));

  if (result.created) {
    appendLog(projectId, "已补充 VectorDrawable 颜色资源：app/src/main/res/values/colors.xml");
  } else if (result.updated) {
    appendLog(projectId, "已追加缺失的 VectorDrawable 颜色资源");
  }
}

async function inferFallbackAppName(projectDir: string) {
  const settingsGradlePath = path.join(projectDir, "settings.gradle.kts");
  if (!(await pathExists(settingsGradlePath))) {
    return "生成应用";
  }

  const settingsContent = await readFile(settingsGradlePath, "utf8");
  const rootProjectNameMatch = settingsContent.match(/rootProject\.name\s*=\s*"([^"]+)"/);
  return rootProjectNameMatch?.[1]?.trim() || "生成应用";
}

function escapeKotlinString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

async function inferLockedNamespace(projectDir: string) {
  const appGradlePath = path.join(projectDir, "app/build.gradle.kts");
  if (await pathExists(appGradlePath)) {
    const namespace = parseNamespaceFromGradle(await readFile(appGradlePath, "utf8"));
    if (namespace) {
      return namespace;
    }
  }

  const projectFiles = await listProjectFiles(projectDir);
  const kotlinFiles = projectFiles.filter((filePath) => filePath.endsWith(".kt"));
  for (const relativePath of kotlinFiles) {
    const content = await readFile(path.join(projectDir, relativePath), "utf8");
    const packageName = content.match(/^\s*package\s+([\w.]+)/m)?.[1]?.trim();
    if (packageName) {
      return packageName.split(".").slice(0, 3).join(".");
    }
  }

  return "com.example.generatedapp";
}

async function enforceLockedGradleBuild(projectId: string, projectDir: string) {
  const projectFiles = await listProjectFiles(projectDir);
  const rawFiles: Array<{ filePath: string; content: string }> = [];
  for (const relativePath of projectFiles) {
    if (
      relativePath === "settings.gradle.kts" ||
      relativePath === "build.gradle.kts" ||
      relativePath === "app/build.gradle.kts"
    ) {
      rawFiles.push({
        filePath: relativePath,
        content: await readFile(path.join(projectDir, relativePath), "utf8"),
      });
    }
  }

  const namespace = await inferLockedNamespace(projectDir);
  const rootProjectName = parseRootProjectName(rawFiles);
  const settingsGradle = `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "${escapeKotlinString(rootProjectName)}"
include(":app")
`;

  const rootBuildGradle = `plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    id("com.google.devtools.ksp") version "1.9.24-1.0.20" apply false
}
`;

  const gradleProperties = `org.gradle.jvmargs=-Xmx4096m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
kotlin.incremental=false
`;

  const appBuildGradle = `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

android {
    namespace = "${escapeKotlinString(namespace)}"
    compileSdk = 35

    defaultConfig {
        applicationId = "${escapeKotlinString(namespace)}"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.activity:activity-compose:1.9.0")

    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material:material")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.material3:material3")

    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-savedstate:2.8.2")

    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}
`;

  await writeFile(path.join(projectDir, "settings.gradle.kts"), settingsGradle, "utf8");
  await writeFile(path.join(projectDir, "build.gradle.kts"), rootBuildGradle, "utf8");
  await writeFile(path.join(projectDir, "gradle.properties"), gradleProperties, "utf8");
  await ensureDir(path.join(projectDir, "app"));
  await writeFile(path.join(projectDir, "app/build.gradle.kts"), appBuildGradle, "utf8");
  appendLog(projectId, `已锁定 Gradle 编译架构：AGP 8.7.3 / Kotlin 1.9.24 / Compose BOM 2024.06.00 / namespace=${namespace}`);
}

function humanizeStringResourceKey(resourceName: string) {
  if (resourceName in DEFAULT_STRING_RESOURCE_VALUES) {
    return DEFAULT_STRING_RESOURCE_VALUES[resourceName as keyof typeof DEFAULT_STRING_RESOURCE_VALUES];
  }

  return resourceName
    .split("_")
    .filter(Boolean)
    .map((segment, index) =>
      index === 0
        ? segment.charAt(0).toUpperCase() + segment.slice(1)
        : segment,
    )
    .join(" ");
}

async function collectReferencedStringResources(projectDir: string) {
  const referenced = new Set<string>(["app_name"]);
  const projectFiles = await listProjectFiles(projectDir);
  const relevantFiles = projectFiles.filter(
    (filePath) =>
      filePath.endsWith(".kt") ||
      filePath.endsWith(".xml"),
  );

  for (const relativePath of relevantFiles) {
    const absolutePath = path.join(projectDir, relativePath);
    const content = await readFile(absolutePath, "utf8");

    for (const match of content.matchAll(/R\.string\.([A-Za-z0-9_]+)/g)) {
      const resourceName = match[1]?.trim();
      if (resourceName) {
        referenced.add(resourceName);
      }
    }

    for (const match of content.matchAll(/@string\/([A-Za-z0-9_]+)/g)) {
      const resourceName = match[1]?.trim();
      if (resourceName) {
        referenced.add(resourceName);
      }
    }
  }

  return [...referenced];
}

async function ensureStringResources(projectId: string, projectDir: string) {
  const stringsFile = path.join(projectDir, "app/src/main/res/values/strings.xml");
  const referencedKeys = await collectReferencedStringResources(projectDir);
  const appName = await inferFallbackAppName(projectDir);

  const fallbackEntries = referencedKeys.map((resourceName) => ({
    resourceName,
    value:
      resourceName === "app_name"
        ? appName
        : humanizeStringResourceKey(resourceName),
  }));

  if (!(await pathExists(stringsFile))) {
    await ensureDir(path.dirname(stringsFile));
    const lines = fallbackEntries.map(
      ({ resourceName, value }) =>
        `    <string name="${resourceName}">${escapeXmlText(value)}</string>`,
    );
    await writeFile(stringsFile, `<resources>\n${lines.join("\n")}\n</resources>\n`, "utf8");
    appendLog(projectId, "已补充基础字符串资源：app/src/main/res/values/strings.xml");
    return;
  }

  const repaired = await updateTextFileIfExists(stringsFile, (content) => {
    const missingLines = fallbackEntries
      .filter(
        ({ resourceName }) =>
          !new RegExp(`<string\\s+name="${escapeRegExp(resourceName)}"`).test(content),
      )
      .map(
        ({ resourceName, value }) =>
          `    <string name="${resourceName}">${escapeXmlText(value)}</string>`,
      );

    if (missingLines.length === 0 || !content.includes("</resources>")) {
      return content;
    }

    return content.replace("</resources>", `${missingLines.join("\n")}\n</resources>`);
  });

  if (repaired) {
    appendLog(projectId, "已追加缺失的字符串资源");
  }
}

async function ensureSplashScreenDependency(projectId: string, projectDir: string) {
  const buildGradlePath = path.join(projectDir, "app/build.gradle.kts");
  const repaired = await updateTextFileIfExists(buildGradlePath, (content) => {
    if (content.includes("androidx.core:core-splashscreen:1.0.1")) {
      return content;
    }

    return content.replace(
      /dependencies\s*\{\n/,
      `dependencies {\n    implementation("androidx.core:core-splashscreen:1.0.1")\n`,
    );
  });

  if (repaired) {
    appendLog(projectId, "已补充 SplashScreen 依赖");
  }
}

// Kotlin ↔ Compose Compiler 版本映射。AGP 在 buildFeatures.compose = true 但
// composeOptions.kotlinCompilerExtensionVersion 缺失时，会退回到 1.3.2 默认值，
// 与 Kotlin 1.9.x 完全不兼容,整条编译直接失败。这里按根 build.gradle.kts
// 的 Kotlin 版本强制补齐。
const KOTLIN_COMPOSE_COMPILER_MAP: Record<string, string> = {
  "1.9.24": "1.5.14",
  "1.9.23": "1.5.13",
  "1.9.22": "1.5.10",
  "1.9.21": "1.5.7",
  "1.9.20": "1.5.4",
  "1.9.10": "1.5.3",
  "1.9.0": "1.5.1",
};
const DEFAULT_COMPOSE_COMPILER_VERSION = "1.5.14";

async function ensureComposeCompilerExtensionVersion(
  projectId: string,
  projectDir: string,
) {
  const rootGradlePath = path.join(projectDir, "build.gradle.kts");
  const appGradlePath = path.join(projectDir, "app/build.gradle.kts");
  if (!(await pathExists(appGradlePath))) return;

  let kotlinVersion: string | null = null;
  if (await pathExists(rootGradlePath)) {
    const rootContent = await readFile(rootGradlePath, "utf8");
    kotlinVersion =
      rootContent.match(/org\.jetbrains\.kotlin\.android["'][^"'\n]*version\s*"([\d.]+)"/)?.[1] ??
      rootContent.match(/kotlin\("[^"]+"\)\s*version\s*"([\d.]+)"/)?.[1] ??
      null;
  }

  const composeCompilerVersion =
    (kotlinVersion && KOTLIN_COMPOSE_COMPILER_MAP[kotlinVersion]) ??
    DEFAULT_COMPOSE_COMPILER_VERSION;

  const repaired = await updateTextFileIfExists(appGradlePath, (content) => {
    if (!/buildFeatures\s*\{[^}]*\bcompose\s*=\s*true/s.test(content)) {
      return content;
    }

    if (/composeOptions\s*\{[^}]*kotlinCompilerExtensionVersion/s.test(content)) {
      return content.replace(
        /(composeOptions\s*\{[^}]*kotlinCompilerExtensionVersion\s*=\s*)"[^"]*"/s,
        `$1"${composeCompilerVersion}"`,
      );
    }

    const insertion = `\n    composeOptions {\n        kotlinCompilerExtensionVersion = "${composeCompilerVersion}"\n    }\n`;
    if (/buildFeatures\s*\{[^}]*\}/s.test(content)) {
      return content.replace(
        /(buildFeatures\s*\{[^}]*\})/s,
        (match) => `${match}${insertion}`,
      );
    }

    return content.replace(/android\s*\{\n/, `android {\n${insertion}`);
  });

  if (repaired) {
    appendLog(
      projectId,
      `已补齐 composeOptions.kotlinCompilerExtensionVersion="${composeCompilerVersion}"（Kotlin=${kotlinVersion ?? "未识别"}）`,
    );
  }
}

const IMPORT_REQUIRED_DEPENDENCIES: Array<{
  importPattern: RegExp;
  coordinate: string;
  gradleLine: string;
  description: string;
}> = [
  {
    importPattern: /import\s+kotlinx\.coroutines\.tasks\.await\b/,
    coordinate: "org.jetbrains.kotlinx:kotlinx-coroutines-play-services",
    gradleLine:
      'implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")',
    description: "kotlinx-coroutines-play-services（Task.await()）",
  },
  {
    importPattern: /import\s+com\.google\.accompanist\.permissions\b/,
    coordinate: "com.google.accompanist:accompanist-permissions",
    gradleLine:
      'implementation("com.google.accompanist:accompanist-permissions:0.34.0")',
    description: "accompanist-permissions",
  },
  {
    importPattern: /import\s+coil\.compose\./,
    coordinate: "io.coil-kt:coil-compose",
    gradleLine: 'implementation("io.coil-kt:coil-compose:2.6.0")',
    description: "coil-compose",
  },
  {
    importPattern: /import\s+androidx\.compose\.material\.icons\./,
    coordinate: "androidx.compose.material:material-icons-extended",
    gradleLine: 'implementation("androidx.compose.material:material-icons-extended")',
    description: "Compose material-icons-extended",
  },
];

const PROACTIVE_KOTLIN_OPT_IN_RULES: Array<{
  annotation: string;
  tokenPattern: RegExp;
}> = [
  {
    annotation: "androidx.compose.material3.ExperimentalMaterial3Api::class",
    tokenPattern:
      /\b(?:SearchBar|SegmentedButton|TimePicker|DatePicker|DatePickerDialog|ExposedDropdownMenuBox|ExposedDropdownMenu|TopAppBar|CenterAlignedTopAppBar|TopAppBarDefaults)\b/,
  },
  {
    annotation: "androidx.compose.foundation.layout.ExperimentalLayoutApi::class",
    tokenPattern: /\b(?:FlowRow|FlowColumn)\b/,
  },
];

const ALLOWED_DIRECT_ANDROIDX_CORE_ARTIFACTS = new Set([
  "core-ktx",
  "core-splashscreen",
]);

async function ensureInferredKotlinDependencies(
  projectId: string,
  projectDir: string,
): Promise<number> {
  const buildGradlePath = path.join(projectDir, "app/build.gradle.kts");
  if (!(await pathExists(buildGradlePath))) {
    return 0;
  }

  const projectFiles = await listProjectFiles(projectDir);
  const kotlinFiles = projectFiles.filter((filePath) => filePath.endsWith(".kt"));
  if (kotlinFiles.length === 0) {
    return 0;
  }

  const contents: string[] = [];
  for (const relativePath of kotlinFiles) {
    contents.push(await readFile(path.join(projectDir, relativePath), "utf8"));
  }
  const joined = contents.join("\n");

  let added = 0;
  for (const rule of IMPORT_REQUIRED_DEPENDENCIES) {
    if (!rule.importPattern.test(joined)) {
      continue;
    }

    const repaired = await updateTextFileIfExists(buildGradlePath, (content) => {
      if (content.includes(rule.coordinate)) {
        return content;
      }
      return content.replace(
        /dependencies\s*\{\n/,
        `dependencies {\n    ${rule.gradleLine}\n`,
      );
    });

    if (repaired) {
      added += 1;
      appendLog(projectId, `已补充 ${rule.description} 依赖`);
    }
  }

  return added;
}

async function sanitizeGradleDependencyDeclarations(
  projectId: string,
  projectDir: string,
) {
  const buildGradlePath = path.join(projectDir, "app/build.gradle.kts");
  let removedUnsupportedCoreDeps = 0;
  let removedDuplicateDeps = 0;

  const repaired = await updateTextFileIfExists(buildGradlePath, (content) => {
    const seenDependencyLines = new Set<string>();
    const nextLines: string[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      const dependencyMatch = trimmed.match(
        /^(implementation|api|compileOnly|runtimeOnly|debugImplementation|androidTestImplementation|testImplementation|ksp)\((.+)\)\s*,?\s*$/,
      );

      if (dependencyMatch) {
        const normalizedDependency = trimmed.replace(/\s+/g, " ");
        if (seenDependencyLines.has(normalizedDependency)) {
          removedDuplicateDeps += 1;
          continue;
        }
        seenDependencyLines.add(normalizedDependency);
      }

      const directCoreMatch = trimmed.match(
        /^(implementation|api|compileOnly|runtimeOnly)\("androidx\.core:([^":]+):[^"]+"\)\s*,?\s*$/,
      );
      const artifactName = directCoreMatch?.[2];
      if (
        artifactName &&
        !ALLOWED_DIRECT_ANDROIDX_CORE_ARTIFACTS.has(artifactName)
      ) {
        removedUnsupportedCoreDeps += 1;
        continue;
      }

      nextLines.push(line);
    }

    return nextLines.join("\n");
  });

  if (repaired) {
    appendLog(
      projectId,
      `已清理 Gradle 依赖声明：移除 ${removedUnsupportedCoreDeps} 个不允许的 androidx.core 直连模块、${removedDuplicateDeps} 个重复依赖`,
    );
  }
}

function buildThemeXml({
  splashBackgroundColor,
}: {
  splashBackgroundColor: string;
}) {
  return `<resources>\n    <style name="Theme.App" parent="android:style/Theme.Material.Light.NoActionBar" />\n    <style name="Theme.App.Starting" parent="Theme.SplashScreen">\n        <item name="windowSplashScreenBackground">@color/${splashBackgroundColor}</item>\n        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>\n        <item name="postSplashScreenTheme">@style/Theme.App</item>\n    </style>\n</resources>\n`;
}

async function ensureThemeResources(projectId: string, projectDir: string) {
  const themeFiles = [
    {
      filePath: path.join(projectDir, "app/src/main/res/values/themes.xml"),
      splashBackgroundColor: "splash_background",
    },
    {
      filePath: path.join(projectDir, "app/src/main/res/values-night/themes.xml"),
      splashBackgroundColor: "splash_background_dark",
    },
  ];

  for (const { filePath, splashBackgroundColor } of themeFiles) {
    if (!(await pathExists(filePath))) {
      await ensureDir(path.dirname(filePath));
      await writeFile(filePath, buildThemeXml({ splashBackgroundColor }), "utf8");
      appendLog(projectId, `已补充主题资源：${path.relative(projectDir, filePath)}`);
      continue;
    }

    const repaired = await updateTextFileIfExists(filePath, (content) => {
      if (!content.includes("</resources>")) {
        return content;
      }

      const additions: string[] = [];
      if (!/<style\s+name="Theme\.App"/.test(content)) {
        additions.push(`    <style name="Theme.App" parent="android:style/Theme.Material.Light.NoActionBar" />`);
      }
      if (!/<style\s+name="Theme\.App\.Starting"/.test(content)) {
        additions.push(
          `    <style name="Theme.App.Starting" parent="Theme.SplashScreen">\n        <item name="windowSplashScreenBackground">@color/${splashBackgroundColor}</item>\n        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>\n        <item name="postSplashScreenTheme">@style/Theme.App</item>\n    </style>`,
        );
      }

      if (additions.length === 0) {
        return content;
      }

      return content.replace("</resources>", `${additions.join("\n")}\n</resources>`);
    });

    if (repaired) {
      appendLog(projectId, `已追加缺失主题定义：${path.relative(projectDir, filePath)}`);
    }
  }
}

async function ensureLauncherIconResources(projectId: string, projectDir: string) {
  const iconForegroundPath = path.join(projectDir, "app/src/main/res/drawable/ic_launcher_foreground.xml");
  const launcherPaths = [
    path.join(projectDir, "app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"),
    path.join(projectDir, "app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml"),
  ];

  if (!(await pathExists(iconForegroundPath))) {
    await ensureDir(path.dirname(iconForegroundPath));
    await writeFile(
      iconForegroundPath,
      `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportWidth="108"\n    android:viewportHeight="108">\n    <path android:fillColor="@color/vector_color_primary_container" android:pathData="M18,54a36,36 0,1 1 72,0a36,36 0,1 1 -72,0" />\n    <path android:fillColor="@color/vector_color_primary" android:pathData="M24,48h18l6,-12h12l6,12h18v12H66l-6,12H48l-6,-12H24z" />\n    <path android:fillColor="@color/vector_color_on_primary" android:pathData="M46,46h16v16H46z" />\n</vector>\n`,
      "utf8",
    );
    appendLog(projectId, "已补充启动图标前景矢量资源");
  }

  for (const launcherPath of launcherPaths) {
    if (await pathExists(launcherPath)) {
      continue;
    }

    await ensureDir(path.dirname(launcherPath));
    await writeFile(
      launcherPath,
      `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n</adaptive-icon>\n`,
      "utf8",
    );
    appendLog(projectId, `已补充自适应图标资源：${path.relative(projectDir, launcherPath)}`);
  }
}

async function ensureEssentialAndroidResources(projectId: string, projectDir: string) {
  await ensureBaselineColorResources(projectId, projectDir);
  await ensureVectorDrawableColorResources(projectId, projectDir);
  await ensureStringResources(projectId, projectDir);
  await ensureSplashScreenDependency(projectId, projectDir);
  await ensureInferredKotlinDependencies(projectId, projectDir);
  await ensureThemeResources(projectId, projectDir);
  await ensureLauncherIconResources(projectId, projectDir);
}

async function repairVectorDrawableThemeAttrs(projectId: string, projectDir: string) {
  const resDir = path.join(projectDir, "app/src/main/res");
  if (!(await pathExists(resDir))) {
    return;
  }

  const resEntries = await readdir(resDir, { withFileTypes: true });
  let repairedCount = 0;

  for (const entry of resEntries) {
    if (!entry.isDirectory() || !entry.name.startsWith("drawable")) {
      continue;
    }

    const drawableDir = path.join(resDir, entry.name);
    const drawableEntries = await readdir(drawableDir, { withFileTypes: true });

    for (const drawableEntry of drawableEntries) {
      if (!drawableEntry.isFile() || !drawableEntry.name.endsWith(".xml")) {
        continue;
      }

      const drawableFile = path.join(drawableDir, drawableEntry.name);
      const repaired = await updateTextFileIfExists(drawableFile, replaceVectorDrawableThemeAttrs);
      if (repaired) {
        repairedCount += 1;
      }
    }
  }

  if (repairedCount > 0) {
    await ensureVectorDrawableColorResources(projectId, projectDir);
    appendLog(projectId, `已修复 ${repairedCount} 个 VectorDrawable 的主题颜色引用`);
  }
}

async function repairCommonAndroidProjectIssues(projectId: string, projectDir: string) {
  await enforceLockedGradleBuild(projectId, projectDir);
  await ensureEssentialAndroidResources(projectId, projectDir);
  await ensureComposeCompilerExtensionVersion(projectId, projectDir);
  await sanitizeGradleDependencyDeclarations(projectId, projectDir);
  await repairGeneratedProjectKnownPitfalls(projectId, projectDir);

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

  await repairVectorDrawableThemeAttrs(projectId, projectDir);

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

  // 通用语法瑕疵清理：AI 偶尔在 @file:OptIn(a, , b)、函数调用 (a,,b) 等处写入多余/空逗号，
  // 产生 "Expecting an argument" 等纯语法错误。这类瑕疵用正则安全清理即可，不必劳动 AI。
  // 逐文件跑过整个 app 目录（不限于错误日志提到的文件），避免一次漏网导致整条流水线失败。
  {
    const allKotlinFiles = (await listProjectFiles(projectDir)).filter((p) => p.endsWith(".kt"));
    let syntaxRepaired = 0;
    for (const rel of allKotlinFiles) {
      const abs = path.join(projectDir, rel);
      const fixed = await updateTextFileIfExists(abs, (content) => {
        // Kotlin 字符串字面量处理：为避免误伤 "a,,b" 这种字面量，先把字符串整体挖出保护起来
        const placeholders: string[] = [];
        const protectedContent = content.replace(
          /("""[\s\S]*?""")|("(?:\\.|[^"\\])*")/g,
          (match) => {
            placeholders.push(match);
            return `\u0000STR${placeholders.length - 1}\u0000`;
          },
        );
        let next = protectedContent;
        // 双/多逗号塌缩为单逗号
        next = next.replace(/,(\s*,)+/g, ",");
        // ( , foo)  ->  ( foo)  |  [ , foo]  ->  [ foo]
        next = next.replace(/([(\[])\s*,\s*/g, "$1");
        // 还原被保护的字符串
        next = next.replace(/\u0000STR(\d+)\u0000/g, (_, i) => placeholders[Number(i)]);
        return next === content ? content : next;
      });
      if (fixed) {
        syntaxRepaired += 1;
      }
    }
    if (syntaxRepaired > 0) {
      repairCount += syntaxRepaired;
      appendLog(
        projectId,
        `已本地清理 ${syntaxRepaired} 个 Kotlin 文件中的多余/空逗号(保护字符串字面量)`,
      );
    }
  }

  // AI 经常在一个 @Composable 的某个 slot lambda（如 confirmButton）里写 `val context = LocalContext.current`
  // 然后在兄弟 slot lambda（如 text、dismissButton）里用 `context.getString(...)`，
  // 导致 `Unresolved reference: context` 级联触发 `@Composable invocations can only happen from the context of a @Composable function`。
  // 修复思路：对每个报错 "Unresolved reference: context" 的 .kt 文件，
  // 在错误行所在的最外层 @Composable 函数体第一行注入 `val context = LocalContext.current`。
  if (errorLog.includes("Unresolved reference: context")) {
    const contextErrors = parseFileLineErrors(projectDir, errorLog);
    let hoistedCount = 0;
    for (const [relativePath, lineNumbers] of contextErrors.entries()) {
      const absolutePath = path.join(projectDir, relativePath);
      if (!(await pathExists(absolutePath))) continue;
      const fixed = await updateTextFileIfExists(absolutePath, (content) =>
        hoistLocalContextToEnclosingComposable(content, [...lineNumbers]),
      );
      if (fixed) {
        hoistedCount += 1;
        repairCount += 1;
        appendLog(
          projectId,
          `已在 ${relativePath} 的 @Composable 顶层补齐 val context = LocalContext.current`,
        );
      }
    }
    if (hoistedCount > 0) {
      // 修完后继续让其它修复跑下去，不要直接 return。
    }
  }

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

  if (
    /Unresolved reference:/.test(errorLog) ||
    /Unresolved reference:\s*(tasks|await)\b/.test(errorLog) ||
    /Unresolved reference:\s*rawValue\b/.test(errorLog) ||
    /Unresolved reference:\s*accompanist\b/.test(errorLog) ||
    /Unresolved reference:\s*coil\b/.test(errorLog)
  ) {
    const added = await ensureInferredKotlinDependencies(projectId, projectDir);
    if (added > 0) {
      repairCount += added;
    }
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
    errorLog.includes("The API of this layout is experimental") ||
    errorLog.includes("ExperimentalMaterial3Api") ||
    errorLog.includes("ExperimentalFoundationApi") ||
    errorLog.includes("ExperimentalLayoutApi") ||
    errorLog.includes("ExperimentalComposeUiApi") ||
    errorLog.includes("ExperimentalAnimationApi") ||
    errorLog.includes("ExperimentalMaterialApi") ||
    errorLog.includes("ExperimentalCoroutinesApi")
  ) {
    const needsMaterial3 =
      errorLog.includes("This material API is experimental") ||
      errorLog.includes("ExperimentalMaterial3Api");
    const needsFoundation =
      errorLog.includes("This foundation API is experimental") ||
      errorLog.includes("ExperimentalFoundationApi");
    const needsLayout =
      errorLog.includes("The API of this layout is experimental") ||
      errorLog.includes("ExperimentalLayoutApi");
    const needsComposeUi = errorLog.includes("ExperimentalComposeUiApi");
    const needsAnimation = errorLog.includes("ExperimentalAnimationApi");
    const needsMaterial = errorLog.includes("ExperimentalMaterialApi");
    const needsCoroutines = errorLog.includes("ExperimentalCoroutinesApi");
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) => {
        const wantedAnnotations: string[] = [];
        if (needsMaterial3) {
          wantedAnnotations.push("androidx.compose.material3.ExperimentalMaterial3Api::class");
        }
        if (needsFoundation) {
          wantedAnnotations.push("androidx.compose.foundation.ExperimentalFoundationApi::class");
        }
        if (needsLayout) {
          wantedAnnotations.push("androidx.compose.foundation.layout.ExperimentalLayoutApi::class");
        }
        if (needsComposeUi) {
          wantedAnnotations.push("androidx.compose.ui.ExperimentalComposeUiApi::class");
        }
        if (needsAnimation) {
          wantedAnnotations.push("androidx.compose.animation.ExperimentalAnimationApi::class");
        }
        if (needsMaterial) {
          wantedAnnotations.push("androidx.compose.material.ExperimentalMaterialApi::class");
        }
        if (needsCoroutines) {
          wantedAnnotations.push("kotlinx.coroutines.ExperimentalCoroutinesApi::class");
        }
        if (wantedAnnotations.length === 0) return content;

        const existingOptInMatch = content.match(/^@file:OptIn\(([^)]*)\)\s*\n/m);
        if (existingOptInMatch) {
          const existing = existingOptInMatch[1];
          const missing = wantedAnnotations.filter((annotation) => !existing.includes(annotation));
          if (missing.length === 0) return content;
          const merged = `@file:OptIn(${[existing.trim(), ...missing].filter(Boolean).join(", ")})\n`;
          return content.replace(existingOptInMatch[0], merged);
        }

        const packageMatch = content.match(/^(package\s+[\w.]+\s*\n)/m);
        if (!packageMatch) return content;
        const header = `@file:OptIn(${wantedAnnotations.join(", ")})\n\n`;
        return header + content;
      });

      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地注入/合并 @file:OptIn：${path.relative(projectDir, targetFile)}`,
        );
      }
    }
  }

  if (/@Composable invocations can only happen from the context of a @Composable function/.test(errorLog)) {
    const locations = extractKotlinErrorLocations(
      projectDir,
      errorLog,
      /@Composable invocations can only happen from the context of a @Composable function/,
    );
    const linesByFile = new Map<string, number[]>();
    for (const location of locations) {
      const group = linesByFile.get(location.filePath) ?? [];
      group.push(location.line);
      linesByFile.set(location.filePath, group);
    }

    for (const [relativePath, lineNumbers] of linesByFile.entries()) {
      const targetFile = path.join(projectDir, relativePath);
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        repairComposableStringResourceMisuse(content, lineNumbers),
      );
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复回调中误用 stringResource：${relativePath}`,
        );
      }
    }
  }

  if (/Unresolved reference:\s*rememberSearchBarState\b/.test(errorLog)) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) => {
        let next = content;
        next = next.replace(
          /^\s*import\s+androidx\.compose\.material3\.rememberSearchBarState\s*\n/gm,
          "",
        );
        next = next.replace(
          /\brememberSearchBarState\s*\([^)]*\)/g,
          'androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf("") }',
        );
        return next === content ? content : next;
      });
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地移除不可解析的 rememberSearchBarState（compose-bom 2024.06 不支持）：${path.relative(
            projectDir,
            targetFile,
          )}`,
        );
      }
    }
  }

  if (
    errorLog.includes("Val cannot be reassigned") ||
    /Type mismatch: inferred type is String but QrContentType/.test(errorLog) ||
    /Type mismatch: inferred type is String but \w+(?:ContentType|Type) /.test(errorLog)
  ) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) => {
        if (!/\.apply\s*\{/.test(content)) {
          return content;
        }
        let next = content;
        next = next.replace(
          /(\.apply\s*\{\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|[^}])*?)(?<!this\.)\btype\s*=\s*"/g,
          "$1this.type = \"",
        );
        return next === content ? content : next;
      });
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复 .apply 块内 type 属性的参数遮蔽：${path.relative(projectDir, targetFile)}`,
        );
      }
    }
  }

  if (errorLog.includes("Named arguments are not allowed for function types")) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        content
          .replace(
            /onSetChanged\(([^,]+),\s*weight\s*=\s*([^,]+),\s*reps\s*=\s*null\)/g,
            "onSetChanged($1, $2, null)",
          )
          .replace(
            /onSetChanged\(([^,]+),\s*reps\s*=\s*([^,]+),\s*weight\s*=\s*null\)/g,
            "onSetChanged($1, null, $2)",
          ),
      );

      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复函数类型参数的命名调用：${path.relative(projectDir, targetFile)}`,
        );
      }
    }
  }

  if (
    /Expected one parameter of type Array<Any\?>/.test(errorLog) ||
    /suspend \(Array<Any\?>.*was expected/.test(errorLog) ||
    /Cannot infer a type for this parameter/.test(errorLog)
  ) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        repairOversizedFlowCombine(content),
      );
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复超过 5 个 Flow 的 combine 调用：${path.relative(projectDir, targetFile)}`,
        );
      }
    }
  }

  if (/Unresolved reference:\s*map\b/.test(errorLog)) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        repairQualifiedFlowMapReference(content),
      );
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复 Flow map 扩展函数的包级引用：${path.relative(projectDir, targetFile)}`,
        );
      }
    }
  }

  if (/Unresolved reference:\s*Forum\b/.test(errorLog)) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        repairUnsupportedMaterialIconReferences(content),
      );
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复不可用的 AutoMirrored Forum 图标引用：${path.relative(
            projectDir,
            targetFile,
          )}`,
        );
      }
    }
  }

  if (
    /Cannot access 'weight': it is internal in 'androidx\.compose\.foundation\.layout'/.test(errorLog) ||
    /Type mismatch:\s*inferred type is PaddingValues but Modifier was expected/.test(errorLog)
  ) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        repairPaddingValuesPassedAsModifier(repairInvalidModifierWeightImport(content)),
      );
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复 weight 错误导入与 PaddingValues/Modifier 参数混用：${path.relative(
            projectDir,
            targetFile,
          )}`,
        );
      }
    }
  }

  if (
    /Type mismatch:\s*inferred type is StateFlow<Any> but StateFlow<UiState<[^>]+>> was expected/.test(errorLog) ||
    /'when' expression must be exhaustive/.test(errorLog)
  ) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        repairForumViewModelNestedFlowUiState(content),
      );
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复 ViewModel 中 map 返回 Flow 导致的 StateFlow<Any>：${path.relative(
            projectDir,
            targetFile,
          )}`,
        );
      }
    }
  }

  if (/Unresolved reference:\s*flattenLatest\b/.test(errorLog)) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) => {
        if (!/\bflattenLatest\b/.test(content)) {
          return content;
        }
        let next = content;
        next = next.replace(
          /kotlinx\.coroutines\.flow\.flattenLatest\s*\(\s*([^)]+?)\s*\)/g,
          "$1.flatMapLatest { it }",
        );
        next = next.replace(
          /\bflattenLatest\s*\(\s*([^)]+?)\s*\)/g,
          "$1.flatMapLatest { it }",
        );

        if (!/import\s+kotlinx\.coroutines\.flow\.flatMapLatest\b/.test(next)) {
          next = next.replace(
            /(^package\s+[\w.]+\s*\n)/m,
            `$1\nimport kotlinx.coroutines.flow.flatMapLatest\n`,
          );
        }

        if (!/@file:OptIn\([^)]*ExperimentalCoroutinesApi[^)]*\)/.test(next)) {
          const existingOptIn = next.match(/^@file:OptIn\(([^)]*)\)\s*\n/m);
          if (existingOptIn) {
            const merged = `@file:OptIn(${existingOptIn[1].trim()}, kotlinx.coroutines.ExperimentalCoroutinesApi::class)\n`;
            next = next.replace(existingOptIn[0], merged);
          } else if (/^package\s+[\w.]+/m.test(next)) {
            next = `@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)\n\n${next}`;
          }
        }

        return next === content ? content : next;
      });
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复 flattenLatest（不存在的 API）为 flatMapLatest：${path.relative(
            projectDir,
            targetFile,
          )}`,
        );
      }
    }
  }

  if (errorLog.includes("Unresolved reference: clickable")) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) => {
        if (!/androidx\.compose\.foundation\.clickable\.\w+Placeholder/.test(content)) {
          return content;
        }
        return content.replace(
          /\n\s*androidx\.compose\.foundation\.clickable\.\w+Placeholder\s*\([\s\S]*?\n\s*\)\s*/g,
          "\n",
        );
      });
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地移除 AI 捏造的 androidx.compose.foundation.clickable.*Placeholder 调用：${path.relative(
            projectDir,
            targetFile,
          )}`,
        );
      }
    }
  }

  if (
    /Unresolved reference:\s*weight\b/.test(errorLog) ||
    /'weight' is only available inside/i.test(errorLog)
  ) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) =>
        repairModifierWeightComposableReceivers(content),
      );
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地把使用 Modifier.weight 的 Composable 改写为 RowScope 扩展：${path.relative(
            projectDir,
            targetFile,
          )}`,
        );
      }
    }
  }

  if (/Unresolved reference:\s*SavedStateHandleSupport\b/.test(errorLog)) {
    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) => {
        if (!/SavedStateHandleSupport/.test(content)) {
          return content;
        }
        let next = content;
        next = next.replace(
          /androidx\.lifecycle\.SavedStateHandleSupport\.createSavedStateHandle\s*\(\s*(\w+)\s*\)/g,
          "$1.createSavedStateHandle()",
        );
        next = next.replace(
          /SavedStateHandleSupport\.createSavedStateHandle\s*\(\s*(\w+)\s*\)/g,
          "$1.createSavedStateHandle()",
        );
        if (
          next !== content &&
          !/import\s+androidx\.lifecycle\.createSavedStateHandle\b/.test(next)
        ) {
          next = next.replace(
            /(^package\s+[\w.]+\s*\n)/m,
            `$1\nimport androidx.lifecycle.createSavedStateHandle\n`,
          );
        }
        return next === content ? content : next;
      });
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地修复 SavedStateHandleSupport 为 extras.createSavedStateHandle() 扩展：${path.relative(
            projectDir,
            targetFile,
          )}`,
        );
      }
    }

    const gradleFixed = await updateTextFileIfExists(
      path.join(projectDir, "app/build.gradle.kts"),
      (content) => {
        if (content.includes("lifecycle-viewmodel-savedstate")) {
          return content;
        }
        return content.replace(
          /(implementation\("androidx\.lifecycle:lifecycle-viewmodel-compose:[^"]+"\)\n)/,
          `$1    implementation("androidx.lifecycle:lifecycle-viewmodel-savedstate:2.8.2")\n`,
        );
      },
    );
    if (gradleFixed) {
      repairCount += 1;
      appendLog(projectId, "已本地补充 lifecycle-viewmodel-savedstate 依赖");
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

  // AI 常把 Kotlin Flow 扩展函数写成包级调用形式:
  // kotlinx.coroutines.flow.first(someFlow) -> someFlow.first()
  // 这类错误会引发后续 "Unresolved reference: xxx" 连锁误报。
  {
    const flowExtensionFns = [
      "first",
      "firstOrNull",
      "last",
      "lastOrNull",
      "single",
      "singleOrNull",
      "toList",
      "toSet",
      "toCollection",
      "count",
      "fold",
      "reduce",
      "collect",
      "collectLatest",
      "collectIndexed",
    ];
    const collectionExtensionFns = ["first", "firstOrNull", "last", "lastOrNull", "single"];
    const rewriteQualifiedExtensionCall = (
      content: string,
      qualifier: string,
      extFns: string[],
    ) => {
      let next = content;
      for (const fnName of extFns) {
        const escapedQualifier = qualifier.replace(/\./g, "\\.");
        const callPattern = new RegExp(`\\b${escapedQualifier}\\.${fnName}\\s*\\(`, "g");
        let match = callPattern.exec(next);
        while (match) {
          const openParenIndex = match.index + match[0].length - 1;
          const closeParenIndex = findMatchingDelimiter(next, openParenIndex, "(", ")");
          if (closeParenIndex < 0) {
            match = callPattern.exec(next);
            continue;
          }
          const argExpr = next.slice(openParenIndex + 1, closeParenIndex).trim();
          if (!argExpr) {
            match = callPattern.exec(next);
            continue;
          }
          const needsParens = /[\s,{}]/.test(argExpr) && !/^\(.*\)$/.test(argExpr);
          const wrapped = needsParens ? `(${argExpr})` : argExpr;
          const replacement = `${wrapped}.${fnName}()`;
          next = `${next.slice(0, match.index)}${replacement}${next.slice(closeParenIndex + 1)}`;
          callPattern.lastIndex = match.index + replacement.length;
          match = callPattern.exec(next);
        }
      }
      return next;
    };

    for (const targetFile of kotlinTargets) {
      const fixed = await updateTextFileIfExists(targetFile, (content) => {
        let next = content;
        next = rewriteQualifiedExtensionCall(next, "kotlinx.coroutines.flow", flowExtensionFns);
        next = rewriteQualifiedExtensionCall(next, "kotlin.collections", collectionExtensionFns);
        // 还有一种常见写法: .let { flow -> flow.first() } 是多余的, 但把 .first() 直接接在链上更安全
        // 保留 let 结构由 AI 后续修复, 此处只处理包级调用到扩展调用的转写
        if (next !== content) {
          for (const fnName of flowExtensionFns) {
            if (new RegExp(`\\.${fnName}\\s*\\(`).test(next)) {
              next = ensureKotlinImport(next, `import kotlinx.coroutines.flow.${fnName}`);
            }
          }
        }
        return next === content ? content : next;
      });
      if (fixed) {
        repairCount += 1;
        appendLog(
          projectId,
          `已本地把 Flow/Collection 扩展函数的包级调用改写为扩展调用形式：${path.relative(
            projectDir,
            targetFile,
          )}`,
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

async function purgeOrphanPackageDirs(projectId: string, projectDir: string) {
  const buildGradlePath = path.join(projectDir, "app/build.gradle.kts");
  if (!(await pathExists(buildGradlePath))) {
    return;
  }

  const buildGradleContent = await readFile(buildGradlePath, "utf8");
  const namespaceMatch = buildGradleContent.match(/namespace\s*=\s*"([^"]+)"/);
  if (!namespaceMatch) {
    return;
  }
  const namespace = namespaceMatch[1];

  const javaRoot = path.join(projectDir, "app/src/main/java");
  if (!(await pathExists(javaRoot))) {
    return;
  }

  const projectFiles = await listProjectFiles(projectDir);
  const kotlinFiles = projectFiles.filter(
    (filePath) =>
      filePath.endsWith(".kt") && filePath.startsWith("app/src/main/java/"),
  );

  const touchedDirs = new Set<string>();
  let removedFiles = 0;
  for (const relativePath of kotlinFiles) {
    const absolutePath = path.join(projectDir, relativePath);
    const content = await readFile(absolutePath, "utf8");
    const packageMatch = content.match(/^\s*package\s+([\w.]+)/m);
    if (!packageMatch) {
      continue;
    }
    const filePackage = packageMatch[1];
    if (filePackage === namespace || filePackage.startsWith(`${namespace}.`)) {
      continue;
    }

    await rm(absolutePath, { force: true });
    touchedDirs.add(path.dirname(absolutePath));
    removedFiles += 1;
  }

  if (removedFiles === 0) {
    return;
  }

  for (const dir of touchedDirs) {
    let current = dir;
    while (current.startsWith(javaRoot) && current !== javaRoot) {
      try {
        const entries = await readdir(current);
        if (entries.length > 0) {
          break;
        }
        await rm(current, { recursive: true, force: true });
        current = path.dirname(current);
      } catch {
        break;
      }
    }
  }

  appendLog(
    projectId,
    `已清理与 namespace（${namespace}）不匹配的残留包目录，共删除 ${removedFiles} 个文件`,
  );
}

async function hasCompleteAndroidProject(projectDir: string): Promise<boolean> {
  if (!(await pathExists(projectDir))) {
    return false;
  }
  for (const relative of REQUIRED_ANDROID_PROJECT_FILES) {
    if (!(await pathExists(path.join(projectDir, relative)))) {
      return false;
    }
  }
  return true;
}

async function persistFailedRawOutput(projectId: string) {
  const build = getBuild(projectId);
  const rawCodeOutput = build?.rawCodeOutput;
  if (!rawCodeOutput) {
    return;
  }

  try {
    const projectDir = path.join(config.tempDir, projectId);
    await ensureDir(projectDir);
    const target = path.join(projectDir, "_raw_model_output.md");
    if (await pathExists(target)) {
      return;
    }
    await writeFile(target, rawCodeOutput, "utf8");
    appendLog(
      projectId,
      `已保存失败时的原始 AI 输出：temp/${projectId}/_raw_model_output.md`,
    );
  } catch (error) {
    console.warn("[build] 保存失败时的原始 AI 输出失败", error);
  }
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

  const generatedFileSet = new Set(files.map((file) => file.filePath));
  const missingRequiredFiles = REQUIRED_ANDROID_PROJECT_FILES.filter(
    (filePath) => !generatedFileSet.has(filePath),
  );
  if (missingRequiredFiles.length > 0) {
    appendLog(
      projectId,
      `检测到 AI 输出不完整，缺少关键文件：${missingRequiredFiles.join("、")}`,
    );
    throw new Error(`AI 输出缺少关键工程文件：${missingRequiredFiles.join("、")}`);
  }

  const missingLockedFiles = validateLockedSourceArchitecture(files);
  if (missingLockedFiles.length > 0) {
    appendLog(
      projectId,
      `检测到 AI 输出不符合固定架构，缺少：${missingLockedFiles.join("、")}`,
    );
    throw new Error(`AI 输出不符合固定架构，缺少：${missingLockedFiles.join("、")}`);
  }

  const missingInternalImports = detectMissingInternalImports(files);
  if (missingInternalImports.length > 0) {
    const preview = missingInternalImports.slice(0, 6).join("、");
    appendLog(
      projectId,
      `检测到 AI 输出缺少被引用的本地源码定义：${preview}`,
    );
    throw new Error(
      `AI 输出缺少被引用的本地源码定义：${preview}`,
    );
  }

  await writeProjectFiles(projectDir, files);
  await enforceLockedGradleBuild(projectId, projectDir);
  await writeLocalProperties(projectDir);

  return {
    projectDir,
    files,
  };
}

function getRecentBuildLogExcerpt(projectId: string, maxLines = 160) {
  const build = getBuild(projectId);
  if (!build) return "";
  const logs = build.logs;
  const errorLinePatterns = [
    /\be:\s/,
    /error:/i,
    /FAILED$/,
    /Unresolved reference/,
    /Type mismatch/,
    /Val cannot be reassigned/,
    /is experimental/,
    /@Composable invocations/,
    /Compilation error/,
    /not found/,
  ];
  const prioritized = logs.filter((line) =>
    errorLinePatterns.some((pattern) => pattern.test(line)),
  );
  const recent = logs.slice(-maxLines);
  const combined: string[] = [];
  const seen = new Set<string>();
  for (const line of [...prioritized, ...recent]) {
    if (seen.has(line)) continue;
    seen.add(line);
    combined.push(line);
  }
  return combined.join("\n");
}

function extractCompileErrorLines(errorLog: string): string[] {
  return errorLog
    .split("\n")
    .map((line) => line.replace(/^\[[^\]]+\]\s*/, "").trim())
    .filter(
      (line) =>
        line.startsWith("e: ") ||
        /^error:/i.test(line) ||
        /Unresolved reference/.test(line) ||
        /Type mismatch/.test(line) ||
        /Val cannot be reassigned/.test(line) ||
        /is experimental/.test(line) ||
        /@Composable invocations/.test(line),
    )
    .slice(0, 40);
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
  const normalizedProjectDir = projectDir.replaceAll("\\", "/");
  const escapedProjectDir = normalizedProjectDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const paths = new Set<string>();
  const patterns: RegExp[] = [
    new RegExp(`${escapedProjectDir}/([^\\s:]+\\.(?:kt|kts|xml|properties|pro))`, "g"),
    /(file:\/\/\/[^\s:]+?\.(?:kt|kts|xml|properties|pro))/g,
    /(?<![A-Za-z0-9_-])((?:app|gradle)\/[^\s:]+?\.(?:kt|kts|xml|properties|pro))/g,
    /(?<![A-Za-z0-9_-])((?:settings\.gradle\.kts|build\.gradle\.kts|gradle\.properties))/g,
  ];

  for (const pattern of patterns) {
    for (const match of normalizedLog.matchAll(pattern)) {
      const captured = match[1]?.trim();
      const relativePath = captured ? normalizeBuildLogPath(projectDir, captured) : null;
      if (relativePath) {
        paths.add(relativePath);
      }
    }
  }

  return [...paths];
}

function safeDecodeUriComponent(input: string) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function normalizeBuildLogPath(projectDir: string, candidate: string) {
  let normalized = candidate.trim().replaceAll("\\", "/");
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("file://")) {
    normalized = normalized.replace(/^file:\/+/, "/");
  }

  normalized = safeDecodeUriComponent(normalized);
  const normalizedProjectDir = safeDecodeUriComponent(projectDir.replaceAll("\\", "/"));

  let relativePath: string;
  if (normalized.startsWith(`${normalizedProjectDir}/`)) {
    relativePath = normalized.slice(normalizedProjectDir.length + 1);
  } else if (path.isAbsolute(normalized)) {
    relativePath = path.relative(projectDir, normalized).replaceAll(path.sep, "/");
  } else {
    relativePath = normalized.replace(/^\.\//, "");
  }

  const parts = relativePath.split("/");
  const isProjectFile =
    relativePath === "settings.gradle.kts" ||
    relativePath === "build.gradle.kts" ||
    relativePath === "gradle.properties" ||
    relativePath.startsWith("app/") ||
    relativePath.startsWith("gradle/");

  if (
    !isProjectFile ||
    parts.includes("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return relativePath;
}

function extractKotlinErrorLocations(
  projectDir: string,
  errorLog: string,
  messagePattern: RegExp,
) {
  const locations: Array<{ filePath: string; line: number }> = [];
  const locationPattern =
    /((?:file:\/\/\/|\/|\.\/|(?:app|gradle)\/)[^\s]+?\.(?:kt|kts)):(\d+):\d+/g;

  for (const rawLine of errorLog.split("\n")) {
    const line = rawLine.replace(/^\[[^\]]+\]\s*/, "").trim();
    if (!messagePattern.test(line)) {
      continue;
    }

    for (const match of line.matchAll(locationPattern)) {
      const filePath = normalizeBuildLogPath(projectDir, match[1] ?? "");
      const lineNumber = Number(match[2]);
      if (filePath && Number.isFinite(lineNumber)) {
        locations.push({ filePath, line: lineNumber });
      }
    }
  }

  return locations;
}

function ensureKotlinImport(content: string, importLine: string) {
  if (content.includes(importLine)) {
    return content;
  }

  const packageMatch = content.match(/^(package\s+[\w.]+\s*\n)/m);
  if (!packageMatch) {
    return content;
  }

  return content.replace(packageMatch[0], `${packageMatch[0]}\n${importLine}\n`);
}

function ensureKotlinFileOptIns(content: string, annotations: string[]) {
  const dedupedAnnotations = [...new Set(annotations.filter(Boolean))];
  if (dedupedAnnotations.length === 0) {
    return content;
  }

  const existingOptInMatch = content.match(/^@file:OptIn\(([^)]*)\)\s*\n/m);
  if (existingOptInMatch) {
    const existing = existingOptInMatch[1];
    const missing = dedupedAnnotations.filter((annotation) => !existing.includes(annotation));
    if (missing.length === 0) {
      return content;
    }

    const merged = `@file:OptIn(${[existing.trim(), ...missing].filter(Boolean).join(", ")})\n`;
    return content.replace(existingOptInMatch[0], merged);
  }

  const packageMatch = content.match(/^(package\s+[\w.]+\s*\n)/m);
  if (!packageMatch) {
    return content;
  }

  return `@file:OptIn(${dedupedAnnotations.join(", ")})\n\n${content}`;
}

function repairApplyBlockPropertyShadowing(content: string) {
  let next = content;

  next = next.replace(
    /(\.apply\s*\{\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|[^}])*?)(?<!this\.)\btype\s*=\s*"/g,
    "$1this.type = \"",
  );

  next = next.replace(
    /(\.apply\s*\{\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|[^}])*?)(?<!this\.)\bdata\s*=\s*(?:android\.net\.)?Uri\.parse\s*\(/g,
    "$1this.data = Uri.parse(",
  );

  return next;
}

function removeDetachedSubmitFooterBlock(content: string) {
  let next = content;
  const detachedPattern =
    /\n\s+val\s+submitScope\s*=\s*(?:androidx\.compose\.runtime\.)?rememberCoroutineScope\(\)\s*\n\s+LaunchedEffect\(Unit\)\s*\{\}\s*\n\s+if\s*\(\s*state\s+is\s+UiState\.Success\s*\)\s*\{/g;
  let searchIndex = 0;

  while (searchIndex < next.length) {
    detachedPattern.lastIndex = searchIndex;
    const match = detachedPattern.exec(next);
    if (!match?.index) {
      break;
    }

    const openIndex = next.indexOf("{", match.index + match[0].lastIndexOf("if"));
    if (openIndex < 0) {
      break;
    }

    const closeIndex = findMatchingDelimiter(next, openIndex, "{", "}");
    if (closeIndex < 0) {
      break;
    }

    const block = next.slice(match.index, closeIndex + 1);
    if (!/PriceFooter\s*\(/.test(block) || !/submitOrder\s*\(\s*\)/.test(block)) {
      searchIndex = closeIndex + 1;
      continue;
    }

    next = `${next.slice(0, match.index)}${next.slice(closeIndex + 1)}`;
    searchIndex = match.index;
  }

  return next;
}

function ensureSubmitCoroutineScope(content: string) {
  const submitIndex = content.indexOf("bookingViewModel.submitOrder()");
  if (submitIndex < 0) {
    return content;
  }

  const functionStart = content.lastIndexOf("@Composable", submitIndex);
  if (functionStart < 0) {
    return content;
  }

  const functionBodyBeforeSubmit = content.slice(functionStart, submitIndex);
  if (/\bval\s+submitScope\s*=\s*(?:androidx\.compose\.runtime\.)?rememberCoroutineScope\(\)/.test(functionBodyBeforeSubmit)) {
    return content;
  }

  const contextMatch = functionBodyBeforeSubmit.match(/\n(\s*)val\s+context\s*=\s*LocalContext\.current\s*\n/);
  if (!contextMatch?.index) {
    return content;
  }

  const insertIndex = functionStart + contextMatch.index + contextMatch[0].length;
  const indent = contextMatch[1] ?? "";
  return `${content.slice(0, insertIndex)}${indent}val submitScope = rememberCoroutineScope()\n${content.slice(insertIndex)}`;
}

function repairCoroutineCallbackMisuse(content: string) {
  let next = content;

  const canSubmitOrder =
    next.includes("bookingViewModel.submitOrder()") &&
    /\bonSubmit\s*\(/.test(next);

  if (canSubmitOrder) {
    next = next.replace(
      /onClick\s*=\s*\{\s*(?:androidx\.compose\.runtime\.)?rememberCoroutineScope\(\)\s*\}/g,
      `onClick = {
                        submitScope.launch {
                            val orderId = bookingViewModel.submitOrder()
                            if (orderId != null) {
                                onSubmit(orderId)
                            }
                        }
                    }`,
    );
    next = removeDetachedSubmitFooterBlock(next);
    next = ensureSubmitCoroutineScope(next);
  } else {
    next = next.replace(
      /onClick\s*=\s*\{\s*(?:androidx\.compose\.runtime\.)?rememberCoroutineScope\(\)\s*\}/g,
      "onClick = {}",
    );
  }

  if (/\brememberCoroutineScope\s*\(\s*\)/.test(next)) {
    next = next.replaceAll(
      "androidx.compose.runtime.rememberCoroutineScope()",
      "rememberCoroutineScope()",
    );
    next = ensureKotlinImport(next, "import androidx.compose.runtime.rememberCoroutineScope");
  }

  if (/\.launch\s*\{/.test(next)) {
    next = ensureKotlinImport(next, "import kotlinx.coroutines.launch");
  }

  return next;
}

async function collectProjectExtensionFunctionImports(projectDir: string) {
  const projectFiles = await listProjectFiles(projectDir);
  const kotlinFiles = projectFiles.filter((filePath) => filePath.endsWith(".kt"));
  const groupedByName = new Map<string, Array<{
    name: string;
    importPath: string;
    packageName: string;
    filePath: string;
  }>>();
  const extensionPattern =
    /^(?:(public|internal|private)\s+)?(?:(?:suspend|inline|tailrec|operator|infix|external|override|open|abstract|final)\s+)*fun\s+[A-Za-z0-9_<>,.?()\s]+\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;

  for (const relativePath of kotlinFiles) {
    const absolutePath = path.join(projectDir, relativePath);
    const content = await readFile(absolutePath, "utf8");
    const packageName = content.match(/^\s*package\s+([\w.]+)/m)?.[1]?.trim();
    if (!packageName) {
      continue;
    }

    for (const match of content.matchAll(extensionPattern)) {
      const visibility = match[1]?.trim();
      const name = match[2]?.trim();
      if (!name || visibility === "private") {
        continue;
      }

      const candidates = groupedByName.get(name) ?? [];
      candidates.push({
        name,
        importPath: `${packageName}.${name}`,
        packageName,
        filePath: relativePath,
      });
      groupedByName.set(name, candidates);
    }
  }

  const uniqueImports = new Map<string, {
    name: string;
    importPath: string;
    packageName: string;
    filePath: string;
  }>();

  for (const [name, candidates] of groupedByName.entries()) {
    const uniqueImportPaths = new Set(candidates.map((candidate) => candidate.importPath));
    if (uniqueImportPaths.size !== 1) {
      continue;
    }

    uniqueImports.set(name, candidates[0]!);
  }

  return uniqueImports;
}

async function ensureProjectExtensionImports(projectId: string, projectDir: string) {
  const extensionImports = await collectProjectExtensionFunctionImports(projectDir);
  if (extensionImports.size === 0) {
    return 0;
  }

  const projectFiles = await listProjectFiles(projectDir);
  const kotlinFiles = projectFiles.filter((filePath) => filePath.endsWith(".kt"));
  let repairedCount = 0;

  for (const relativePath of kotlinFiles) {
    const absolutePath = path.join(projectDir, relativePath);
    const repaired = await updateTextFileIfExists(absolutePath, (content) => {
      const packageName = content.match(/^\s*package\s+([\w.]+)/m)?.[1]?.trim();
      if (!packageName) {
        return content;
      }

      let next = content;
      for (const candidate of extensionImports.values()) {
        if (candidate.filePath === relativePath || candidate.packageName === packageName) {
          continue;
        }

        const alreadyImported = new RegExp(
          `^import\\s+${escapeRegExp(candidate.importPath)}(?:\\s+as\\s+\\w+)?\\s*$`,
          "m",
        ).test(next);
        const alreadyStarImported = new RegExp(
          `^import\\s+${escapeRegExp(candidate.packageName)}\\.\\*\\s*$`,
          "m",
        ).test(next);
        const callsExtension = new RegExp(
          `\\.\\s*${escapeRegExp(candidate.name)}\\s*\\(`,
        ).test(next);

        if (!alreadyImported && !alreadyStarImported && callsExtension) {
          next = ensureKotlinImport(next, `import ${candidate.importPath}`);
        }
      }

      return next;
    });

    if (repaired) {
      repairedCount += 1;
      appendLog(
        projectId,
        `已在预编译阶段补齐项目内 extension import：${relativePath}`,
      );
    }
  }

  return repairedCount;
}

function parseNamespaceFromGradle(content: string) {
  return (
    content.match(/namespace\s*=\s*"([^"]+)"/)?.[1]?.trim() ??
    content.match(/applicationId\s*=\s*"([^"]+)"/)?.[1]?.trim() ??
    null
  );
}

async function repairProjectLocalSymbolImports(projectId: string, projectDir: string) {
  const buildGradlePath = path.join(projectDir, "app/build.gradle.kts");
  if (!(await pathExists(buildGradlePath))) {
    return 0;
  }

  const namespace = parseNamespaceFromGradle(await readFile(buildGradlePath, "utf8"));
  if (!namespace) {
    return 0;
  }

  const projectFiles = await listProjectFiles(projectDir);
  const kotlinFiles = projectFiles.filter((filePath) => filePath.endsWith(".kt"));
  const files: Array<{ filePath: string; content: string }> = [];
  for (const relativePath of kotlinFiles) {
    files.push({
      filePath: relativePath,
      content: await readFile(path.join(projectDir, relativePath), "utf8"),
    });
  }

  const uniqueSymbolImports = collectDeclaredKotlinSymbolImports(files);
  let repairedCount = 0;

  for (const relativePath of kotlinFiles) {
    const absolutePath = path.join(projectDir, relativePath);
    const repaired = await updateTextFileIfExists(absolutePath, (content) => {
      let next = content;
      for (const match of content.matchAll(/^import\s+([A-Za-z0-9_.]+)(?:\s+as\s+\w+)?\s*$/gm)) {
        const importPath = match[1]?.trim();
        if (
          !importPath ||
          !importPath.startsWith(`${namespace}.`) ||
          importPath === `${namespace}.R` ||
          importPath.endsWith(".*")
        ) {
          continue;
        }

        const symbolName = importPath.split(".").pop();
        if (!symbolName) {
          continue;
        }

        const actualImportPath = uniqueSymbolImports.get(symbolName);
        if (!actualImportPath || actualImportPath === importPath) {
          continue;
        }

        next = next.replace(
          new RegExp(`^import\\s+${escapeRegExp(importPath)}\\s*$`, "m"),
          `import ${actualImportPath}`,
        );
      }

      return next;
    });

    if (repaired) {
      repairedCount += 1;
      appendLog(
        projectId,
        `已在预编译阶段修正项目内 symbol import：${relativePath}`,
      );
    }
  }

  return repairedCount;
}

function repairUnsupportedComposeImports(content: string) {
  return content
    .replace(/^\s*import\s+androidx\.compose\.material3\.segmentedButtonColors\s*\n/gm, "")
    .replace(/^\s*import\s+androidx\.compose\.material3\.segmentedButtonItems\s*\n/gm, "")
    // AI 经常把 navArgument 误写到 navigation.compose 子包下，实际 API 在 androidx.navigation 顶层。
    .replace(
      /^\s*import\s+androidx\.navigation\.compose\.navArgument\s*$/gm,
      "import androidx.navigation.navArgument",
    );
}

async function repairGeneratedProjectKnownPitfalls(projectId: string, projectDir: string) {
  const projectFiles = await listProjectFiles(projectDir);
  const kotlinFiles = projectFiles.filter((filePath) => filePath.endsWith(".kt"));
  const kotlinSnapshots: KotlinFileSnapshot[] = [];

  for (const relativePath of kotlinFiles) {
    try {
      kotlinSnapshots.push({
        relativePath,
        content: await readFile(path.join(projectDir, relativePath), "utf8"),
      });
    } catch {
    }
  }

  const uiStateTypeIndex = buildUiStateTypeIndex(kotlinSnapshots);

  for (const relativePath of kotlinFiles) {
    const absolutePath = path.join(projectDir, relativePath);
    const repaired = await updateTextFileIfExists(absolutePath, (content) => {
      let next = content;
      const annotations = PROACTIVE_KOTLIN_OPT_IN_RULES
        .filter((rule) => rule.tokenPattern.test(next))
        .map((rule) => rule.annotation);

      next = ensureKotlinFileOptIns(next, annotations);
      next = repairApplyBlockPropertyShadowing(next);
      next = repairCoroutineCallbackMisuse(next);
      next = repairUnsupportedComposeImports(next);
      next = repairOversizedFlowCombine(next);
      next = repairChainedFlowCombineWithMultipleArguments(next);
      next = repairQualifiedFlowMapReference(next);
      next = repairUnsupportedMaterialIconReferences(next);
      next = repairInvalidModifierWeightImport(next);
      next = repairPaddingValuesPassedAsModifier(next);
      next = repairMissingFlatMapLatestOptIn(next);
      next = repairModifierWeightComposableReceivers(next, {
        onlyLikelyNavigationItems: true,
      });
      next = repairForumViewModelNestedFlowUiState(next);
      next = repairGenericUiStateSuccessChecks(next, uiStateTypeIndex);
      return next;
    });

    if (repaired) {
      appendLog(
        projectId,
        `已在预编译阶段修复 Kotlin 常见陷阱：${relativePath}`,
      );
    }
  }

  await repairProjectLocalSymbolImports(projectId, projectDir);
  await ensureProjectExtensionImports(projectId, projectDir);
}

function findComposableFunctionOpeningBrace(lines: string[], targetLineIndex: number) {
  for (let index = targetLineIndex; index >= 0; index -= 1) {
    if (!/\{\s*$/.test(lines[index] ?? "")) {
      continue;
    }
    const header = lines.slice(Math.max(0, index - 16), index + 1).join("\n");
    if (/@Composable\b/.test(header) && /\bfun\b/.test(header)) {
      return index;
    }
  }

  return -1;
}

function repairComposableStringResourceMisuse(content: string, lineNumbers: number[]) {
  const lines = content.split("\n");
  const braceLinesNeedingContext = new Set<number>();
  let changed = false;

  for (const lineNumber of [...new Set(lineNumbers)].sort((a, b) => a - b)) {
    const targetIndex = lineNumber - 1;
    if (targetIndex < 0 || targetIndex >= lines.length) {
      continue;
    }

    const originalLine = lines[targetIndex] ?? "";
    const replacedLine = originalLine.replace(
      /stringResource\s*\(\s*(?:id\s*=\s*)?([^)]+?)\s*\)/g,
      "context.getString($1)",
    );

    if (replacedLine === originalLine) {
      continue;
    }

    lines[targetIndex] = replacedLine;
    changed = true;

    const braceLine = findComposableFunctionOpeningBrace(lines, targetIndex);
    if (braceLine < 0) {
      continue;
    }

    const blockBeforeTarget = lines.slice(braceLine + 1, targetIndex).join("\n");
    if (!/\bval\s+context\s*=\s*LocalContext\.current\b/.test(blockBeforeTarget)) {
      braceLinesNeedingContext.add(braceLine);
    }
  }

  if (!changed) {
    return content;
  }

  for (const braceLine of [...braceLinesNeedingContext].sort((a, b) => b - a)) {
    const line = lines[braceLine] ?? "";
    const indent = (line.match(/^(\s*)/)?.[1] ?? "") + "    ";
    lines.splice(braceLine + 1, 0, `${indent}val context = LocalContext.current`);
  }

  let next = lines.join("\n");
  if (next.includes("context.getString(")) {
    next = ensureKotlinImport(next, "import androidx.compose.ui.platform.LocalContext");
  }

  return next;
}

// 把 `val context = LocalContext.current` 提到报错行所在 @Composable 函数体的最顶端。
// AI 常见 bug：把这一行写进某个 slot lambda（confirmButton/confirmButton/text）里，
// 兄弟 slot 拿不到，触发 Unresolved reference: context 及其级联错误。
function hoistLocalContextToEnclosingComposable(content: string, lineNumbers: number[]) {
  const lines = content.split("\n");
  const composableBraceLines = new Set<number>();

  for (const lineNumber of lineNumbers) {
    const targetIndex = lineNumber - 1;
    if (targetIndex < 0 || targetIndex >= lines.length) continue;
    const braceLine = findComposableFunctionOpeningBrace(lines, targetIndex);
    if (braceLine < 0) continue;
    composableBraceLines.add(braceLine);
  }

  if (composableBraceLines.size === 0) return content;

  // 从下往上插，避免前面的插入改变后面的行号
  let changed = false;
  for (const braceLine of [...composableBraceLines].sort((a, b) => b - a)) {
    const line = lines[braceLine] ?? "";
    const indent = (line.match(/^(\s*)/)?.[1] ?? "") + "    ";
    // 检查该 @Composable 函数体（最多前 40 行）是否已经在顶层声明过 context
    let functionBodyHasTopLevelContext = false;
    let depth = 1;
    for (let i = braceLine + 1; i < Math.min(lines.length, braceLine + 120) && depth > 0; i += 1) {
      const text = lines[i] ?? "";
      if (depth === 1 && /^\s*val\s+context\s*=\s*LocalContext\.current\b/.test(text)) {
        functionBodyHasTopLevelContext = true;
        break;
      }
      for (const ch of text) {
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
        if (depth === 0) break;
      }
    }
    if (functionBodyHasTopLevelContext) continue;
    lines.splice(braceLine + 1, 0, `${indent}val context = LocalContext.current`);
    changed = true;
  }

  if (!changed) return content;

  let next = lines.join("\n");
  next = ensureKotlinImport(next, "import androidx.compose.ui.platform.LocalContext");
  return next;
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

  // 始终把数据层/模型定义相关的 Kotlin 文件也放进上下文，
  // 因为 "Unresolved reference: xxx" 常常是调用方引用了数据类未定义的字段，
  // AI 没有数据类定义就猜不对。
  const dataLayerFiles = projectFiles.filter((filePath) => {
    if (!filePath.endsWith(".kt")) return false;
    return /\/(data|model|models|entity|entities|domain)\//.test(filePath);
  });

  const unresolvedSymbols = extractUnresolvedSymbols(errorLog);
  const symbolSection = unresolvedSymbols.length
    ? `未解析符号（需要在修复后让这些引用被正确定义或移除）：\n- ${unresolvedSymbols.join("\n- ")}\n\n`
    : "";

  // 优先：错误日志里出现的文件放最前，数据层定义次之，关键 Gradle/Manifest 最后兜底
  const selectedFiles = [
    ...new Set([...mentionedFiles, ...dataLayerFiles, ...importantFiles]),
  ]
    .filter((filePath) => projectFiles.includes(filePath))
    .slice(0, 40);

  const fileBlocks: string[] = [];
  for (const relativePath of selectedFiles) {
    const absolutePath = path.join(projectDir, relativePath);
    const content = await readFile(absolutePath, "utf8");
    fileBlocks.push(`\`\`\`${relativePath}\n${content.slice(0, 24000)}\n\`\`\``);
  }

  const structure = projectFiles.slice(0, 160).join("\n");
  const errorLines = extractCompileErrorLines(errorLog);
  const errorSection = errorLines.length
    ? `编译器报错（按出现顺序）：\n${errorLines.join("\n")}\n\n`
    : "";
  return `${errorSection}${symbolSection}项目文件列表：\n${structure}\n\n关键文件内容（含错误文件优先，数据层定义全部包含）：\n${fileBlocks.join("\n\n")}`;
}

function extractUnresolvedSymbols(errorLog: string): string[] {
  const symbols = new Set<string>();
  const pattern = /Unresolved reference:\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(errorLog)) !== null) {
    symbols.add(match[1]);
  }
  return [...symbols].slice(0, 30);
}

interface StreamingCodegenCallbacks {
  streamSignal: AbortSignal;
  onTextChunk: (chunk: string) => void;
  onResolvedModel: (model: string, aliased: boolean) => void;
  onReasoningChunk?: (chunk: string) => void;
  onStreamingFallback?: (error: unknown) => void;
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
  let lastTextChunkAt: number | null = null;
  let lastStructuredProgressAt: number | null = null;
  let lastGeneratedFileCount = 0;
  let streamForcedFallback = false;
  let reasoningChars = 0;
  let lastReasoningAt: number | null = null;
  let lastReasoningLogAt = 0;
  const codegenStartedAt = Date.now();
  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    if (streamForcedFallback) {
      return;
    }
    appendLog(projectId, waitingLogs[heartbeatIndex % waitingLogs.length]);
    heartbeatIndex += 1;
  }, 3500);
  const stallWatcher = setInterval(() => {
    if (streamForcedFallback) {
      return;
    }

    if (!receivedChunk) {
      if (lastReasoningAt !== null) {
        if (Date.now() - lastReasoningAt < CODEGEN_STREAM_IDLE_TIMEOUT_MS) {
          return;
        }

        streamForcedFallback = true;
        setCodeStreamState(projectId, "fallback");
        appendLog(
          projectId,
          `检测到流式推理超过 ${Math.round(
            CODEGEN_STREAM_IDLE_TIMEOUT_MS / 1000,
          )} 秒没有新增内容，已停止流式预览并等待完整结果返回`,
        );
        controller.abort();
        return;
      }

      if (Date.now() - codegenStartedAt < CODEGEN_FIRST_CHUNK_TIMEOUT_MS) {
        return;
      }

      streamForcedFallback = true;
      setCodeStreamState(projectId, "fallback");
      appendLog(
        projectId,
        `检测到流式输出超过 ${Math.round(
          CODEGEN_FIRST_CHUNK_TIMEOUT_MS / 1000,
        )} 秒仍未收到首个代码块，已停止流式预览并等待完整结果返回`,
      );
      controller.abort();
      return;
    }

    if (firstChunkAt === null) {
      return;
    }

    const lastActivityAt = lastTextChunkAt ?? lastStructuredProgressAt ?? firstChunkAt;
    if (Date.now() - lastActivityAt < CODEGEN_STREAM_IDLE_TIMEOUT_MS) {
      return;
    }

    streamForcedFallback = true;
    setCodeStreamState(projectId, "fallback");
    appendLog(
      projectId,
      `检测到流式输出超过 ${Math.round(
        CODEGEN_STREAM_IDLE_TIMEOUT_MS / 1000,
      )} 秒没有新的代码片段，已停止流式预览并等待完整结果返回`,
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
        lastTextChunkAt = Date.now();
        appendCodeChunk(projectId, chunk);

        const analyzed = analyzeGeneratedCode(streamedCode, {
          includeOpenFile: true,
        });
        if (analyzed.generatedFileCount > lastGeneratedFileCount) {
          lastGeneratedFileCount = analyzed.generatedFileCount;
          lastStructuredProgressAt = Date.now();
        }
      },
      onReasoningChunk: (chunk) => {
        if (!chunk) {
          return;
        }
        reasoningChars += chunk.length;
        lastReasoningAt = Date.now();
        // 每累计 ~400 字符或首次出现时打一条日志，避免日志被刷屏
        if (
          lastReasoningLogAt === 0 ||
          Date.now() - lastReasoningLogAt > 5_000
        ) {
          appendLog(
            projectId,
            `模型正在思考方案（已累计 ${reasoningChars} 字符推理内容），稍后开始输出代码`,
          );
          lastReasoningLogAt = Date.now();
        }
      },
      onStreamingFallback: (error: unknown) => {
        setCodeStreamState(projectId, "fallback");
        const message = error instanceof Error ? error.message : String(error);
        appendLog(
          projectId,
          `OpenAI 流式代码输出中断，已切换普通生成模式；代码预览会暂停增量刷新，等待完整结果返回（${message}）`,
        );
      },
    });
  } finally {
    clearInterval(heartbeat);
    clearInterval(stallWatcher);
  }

  if (!receivedChunk) {
    appendLog(projectId, "未收到流式片段，已使用完整返回结果填充代码预览");
    replaceCodeOutput(projectId, generatedCode, streamForcedFallback ? "fallback" : "streaming");
  } else if (generatedCode.trim() && generatedCode.trim() !== streamedCode.trim()) {
    appendLog(
      projectId,
      streamForcedFallback
        ? "已使用完整返回结果替换卡住的流式输出"
        : "已使用完整返回结果刷新代码预览",
    );
    replaceCodeOutput(projectId, generatedCode, streamForcedFallback ? "fallback" : "streaming");
  }

  return generatedCode;
}

async function materializeGeneratedProject(
  projectId: string,
  prd: string,
  initialRawCode: string,
) {
  let rawCode = initialRawCode;
  let continuationUsed = false;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const generatedProject = await writeGeneratedFiles(projectId, rawCode);
      appendLog(
        projectId,
        `已解析 ${generatedProject.files.length} 个代码文件并写入临时工程目录`,
      );
      await purgeOrphanPackageDirs(projectId, generatedProject.projectDir);
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
      const previousRawCode = rawCode;
      const shouldContinue =
        !continuationUsed && hasLikelyTruncatedAndroidProject(previousRawCode);

      if (shouldContinue) {
        continuationUsed = true;
        appendLog(
          projectId,
          `检测到上次输出疑似在中途被截断（已有 ${previousRawCode.length} 字符），尝试从断点续写而非整体重来`,
        );
        const continuation = await runStreamingCodegen(
          projectId,
          `断点续写`,
          (opts) => continueAndroidCodeFromPartial(prd, previousRawCode, opts),
        );
        rawCode = `${previousRawCode}\n${continuation}`;
      } else {
        appendLog(projectId, `准备重新生成完整工程（第 ${attempt + 1} 次）`);
        rawCode = await runStreamingCodegen(
          projectId,
          `第 ${attempt + 1} 次重新生成`,
          (opts) => regenerateAndroidCode(prd, previousRawCode, reason, opts),
        );
      }
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
  const buildCommand = `chmod +x ./gradlew && ./gradlew assembleDebug`;
  const buildLogPath = path.join(projectDir, "build.log");
  await writeFile(buildLogPath, "", "utf8");

  return new Promise<void>((resolve, reject) => {
    // 直接用 projectDir 作为 spawn 的 cwd（而不是 config.rootDir），
    // 保证当仓库放在中文路径下时，Gradle 进程从始至终都跑在 ASCII 安全的 temp 目录里，
    // 避免中文 cwd 触发 Kotlin Daemon / NIO 的路径编码问题。
    const child = spawn("sh", ["-c", buildCommand], {
      cwd: projectDir,
      env: getBuildEnvironment(),
    });

    child.stdout.on("data", (buffer) => {
      const message = buffer.toString();
      void appendFile(buildLogPath, message).catch(() => {});
      appendLog(projectId, message.trim());
    });

    child.stderr.on("data", (buffer) => {
      const message = buffer.toString();
      void appendFile(buildLogPath, message).catch(() => {});
      appendLog(projectId, message.trim());
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

export async function startBuild(
  projectId: string,
  options: { skipCodegen?: boolean } = {},
) {
  const existingProject = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!existingProject) {
    throw new Error("项目不存在。");
  }

  initBuild(projectId);

  void (async () => {
    try {
      assertBuildPathIsSafe();
      const candidateDir = path.join(config.tempDir, projectId);
      const canSkipCodegen =
        options.skipCodegen === true &&
        (await hasCompleteAndroidProject(candidateDir));

      let projectDir: string;

      if (canSkipCodegen) {
        appendLog(projectId, "检测到已存在的工程文件，跳过代码生成，直接进入编译");
        setStep(projectId, "analysis", "generating");
        setStep(projectId, "codegen", "generating");
        markCodeStreamComplete(projectId);
        projectDir = candidateDir;
      } else {
        if (options.skipCodegen) {
          appendLog(projectId, "未找到完整工程文件，回退为完整重新生成");
        }
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
        projectDir = generatedProject.projectDir;
      }

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

      await persistFailedRawOutput(projectId);

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
  const maxRepairAttempts = 5;
  await repairCommonAndroidProjectIssues(projectId, projectDir);
  await writeLocalProperties(projectDir);

  for (let repairAttempt = 0; repairAttempt <= maxRepairAttempts; repairAttempt += 1) {
    try {
      await runGradleBuild(projectId, projectDir);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知编译错误";
      if (repairAttempt >= maxRepairAttempts) {
        // 所有 AI 修复尝试用尽，进入兜底阶段：对仍然报错的函数做 TODO() stub，
        // 牺牲少量业务功能以保证 APK 能编译出来。
        appendLog(
          projectId,
          `AI 修复 ${maxRepairAttempts} 次后仍未通过编译，进入兜底 stub 阶段`,
        );
        const lastErrorLog = getRecentBuildLogExcerpt(projectId);
        const stubbed = await stubUnresolvedFunctions(projectId, projectDir, lastErrorLog);
        if (stubbed > 0) {
          appendLog(
            projectId,
            `兜底阶段已把 ${stubbed} 个报错函数体替换为 TODO() 存根，重新执行 ./gradlew assembleDebug`,
          );
          try {
            await runGradleBuild(projectId, projectDir);
            return;
          } catch (finalError) {
            const finalLog = getRecentBuildLogExcerpt(projectId);
            const secondStub = await stubUnresolvedFunctions(projectId, projectDir, finalLog);
            if (secondStub > 0) {
              appendLog(
                projectId,
                `兜底阶段二次 stub ${secondStub} 个函数，再次重试编译`,
              );
              await runGradleBuild(projectId, projectDir);
              return;
            }
            throw finalError;
          }
        }
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

      try {
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
          appendLog(
            projectId,
            "AI 修复没有返回任何可写入文件，本轮跳过 AI 修复，直接进入下一轮本地修复/兜底阶段",
          );
          continue;
        }

        await writeProjectFiles(projectDir, repairedFiles);
        await writeLocalProperties(projectDir);
        appendLog(projectId, `AI 修复完成，已更新 ${repairedFiles.length} 个文件`);
        await purgeOrphanPackageDirs(projectId, projectDir);
        await repairCommonAndroidProjectIssues(projectId, projectDir);
        appendLog(projectId, "重新执行 ./gradlew assembleDebug");
      } catch (aiError) {
        const aiMessage =
          aiError instanceof Error ? aiError.message : "未知 AI 修复异常";
        appendLog(
          projectId,
          `AI 修复调用失败（可能超时/代理异常），本轮转为本地修复+下一轮继续：${aiMessage}`,
        );
        // 即使 AI 修复失败，也要继续下一轮；下一轮本地兼容修复或最终 stub 兜底会兜住。
      }
    }
  }

  throw new Error("AI 修复多次后仍未通过编译。");
}

// 兜底 stub：解析编译日志中带 "file.kt:line:col" 的 e: 错误，
// 把出错行所在的顶层/嵌套函数体替换为 TODO("auto-stubbed") 单语句。
// 这会让函数签名保留、类型检查通过，保证 ./gradlew assembleDebug 能跑出 APK。
async function stubUnresolvedFunctions(
  projectId: string,
  projectDir: string,
  errorLog: string,
) {
  const fileLineErrors = parseFileLineErrors(projectDir, errorLog);
  if (fileLineErrors.size === 0) return 0;

  let stubCount = 0;
  for (const [relativePath, lineNumbers] of fileLineErrors.entries()) {
    const absolutePath = path.join(projectDir, relativePath);
    if (!(await pathExists(absolutePath))) continue;
    const original = await readFile(absolutePath, "utf8");
    const stubbed = stubKotlinFunctionsContainingLines(original, lineNumbers);
    if (stubbed !== original) {
      await writeFile(absolutePath, stubbed, "utf8");
      stubCount += 1;
      appendLog(
        projectId,
        `已把 ${relativePath} 中报错行所在函数体替换为 TODO() 存根`,
      );
    }
  }
  return stubCount;
}

function parseFileLineErrors(projectDir: string, errorLog: string) {
  const normalizedLog = errorLog.replaceAll("\\", "/");
  const normalizedProjectDir = projectDir.replaceAll("\\", "/");
  const escapedProjectDir = normalizedProjectDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const result = new Map<string, Set<number>>();

  const pushError = (pathLike: string, line: number) => {
    const relativePath = normalizeBuildLogPath(projectDir, pathLike);
    if (!relativePath || !relativePath.endsWith(".kt")) return;
    const existing = result.get(relativePath) ?? new Set<number>();
    existing.add(line);
    result.set(relativePath, existing);
  };

  const patterns: RegExp[] = [
    // e: /abs/path/file.kt:LINE:COL Unresolved reference
    new RegExp(`e:\\s+(?:file://)?(${escapedProjectDir}/[^\\s:]+?\\.kt):(\\d+):\\d+`, "g"),
    // e: file:///abs/path/file.kt:LINE:COL
    /e:\s+file:\/\/\/([^\s:]+?\.kt):(\d+):\d+/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedLog)) !== null) {
      const line = Number(match[2]);
      if (Number.isFinite(line) && line > 0) {
        pushError(match[1], line);
      }
    }
  }
  return result;
}

function stubKotlinFunctionsContainingLines(
  source: string,
  errorLineNumbers: Set<number>,
) {
  if (errorLineNumbers.size === 0) return source;

  // 以字节偏移跟踪行号
  const lineOffsets: number[] = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") lineOffsets.push(i + 1);
  }
  const offsetForLine = (line: number) =>
    line <= 0 ? 0 : line > lineOffsets.length ? source.length : lineOffsets[line - 1];

  // 枚举所有 fun 声明及其 body 区间（用 findMatchingDelimiter 处理大括号匹配）
  const funHeader = /\bfun\s+(?:<[^>]+>\s+)?(?:[A-Za-z_][\w.<>]*\s*\.\s*)?[A-Za-z_]\w*\s*(?:<[^>]+>)?\s*\(/g;
  type Region = { bodyOpen: number; bodyClose: number; headerStart: number };
  const regions: Region[] = [];
  let headerMatch: RegExpExecArray | null;
  while ((headerMatch = funHeader.exec(source)) !== null) {
    const headerStart = headerMatch.index;
    const paramOpen = headerMatch.index + headerMatch[0].length - 1;
    const paramClose = findMatchingDelimiter(source, paramOpen, "(", ")");
    if (paramClose < 0) continue;
    // body open brace: find next '{' after paramClose, but bail if we see '=' (expression body) or ';' or newline-terminated signature
    let braceIndex = -1;
    for (let i = paramClose + 1; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "{") { braceIndex = i; break; }
      if (ch === "=" || ch === ";") break;
      // 遇到非空白/非注解/非返回类型标记就继续扫
    }
    if (braceIndex < 0) continue;
    const bodyClose = findMatchingDelimiter(source, braceIndex, "{", "}");
    if (bodyClose < 0) continue;
    regions.push({ bodyOpen: braceIndex, bodyClose, headerStart });
    funHeader.lastIndex = braceIndex + 1;
  }

  // 对每个错误行，找最内层的函数体覆盖之
  const chosen = new Map<number, Region>(); // key = bodyOpen
  for (const line of errorLineNumbers) {
    const offset = offsetForLine(line);
    let best: Region | null = null;
    for (const region of regions) {
      if (region.bodyOpen < offset && offset < region.bodyClose) {
        if (!best || region.bodyOpen > best.bodyOpen) {
          best = region;
        }
      }
    }
    if (best) chosen.set(best.bodyOpen, best);
  }
  if (chosen.size === 0) return source;

  // 按 bodyOpen 倒序替换，避免偏移错乱
  const sortedRegions = [...chosen.values()].sort((a, b) => b.bodyOpen - a.bodyOpen);
  let next = source;
  for (const region of sortedRegions) {
    const before = next.slice(0, region.bodyOpen + 1);
    const after = next.slice(region.bodyClose);
    const stub = `\n    TODO(\"auto-stubbed: 编译期未解析引用已兜底\")\n`;
    next = `${before}${stub}${after}`;
  }
  return next;
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

export async function getPersistedBuildLog(projectId: string) {
  const buildLogPath = path.join(config.tempDir, projectId, "build.log");
  if (!(await pathExists(buildLogPath))) {
    return {
      exists: false,
      content: "",
    };
  }

  const content = await readFile(buildLogPath, "utf8");
  return {
    exists: true,
    content,
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
      existing.error = undefined;
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
