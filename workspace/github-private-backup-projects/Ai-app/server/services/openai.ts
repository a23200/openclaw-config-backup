import OpenAI from "openai";
import { config, assertOpenAiConfigured } from "../config.js";
import {
  applyTemplate,
  CODE_GENERATION_PROMPT,
  CODE_GENERATION_SYSTEM_PROMPT,
  PRD_GENERATION_PROMPT,
} from "../prompts.js";

interface TextCompletionOptions {
  onTextChunk?: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onResolvedModel?: (model: string, aliased: boolean) => void;
  modelOverride?: string;
  streamSignal?: AbortSignal;
  systemPrompt?: string;
  onStreamingFallback?: (error: unknown) => void;
}

let client: OpenAI | null = null;
const STREAM_REQUEST_TIMEOUT_MS = 420_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 420_000;

function getClient() {
  assertOpenAiConfigured();
  if (!client) {
    client = new OpenAI({
      apiKey: config.openAiApiKey,
      baseURL: config.openAiBaseUrl,
    });
  }
  return client;
}

function resolveProviderModel(model: string) {
  if (!config.openAiBaseUrl.includes("api.codexzh.com") && model.startsWith("cc-")) {
    return model.slice(3);
  }

  return model;
}

function getProviderModelCandidates(model: string) {
  const resolvedModel = resolveProviderModel(model);
  const fallbackModels = resolvedModel.startsWith("cc-")
    ? [resolvedModel.slice(3)]
    : [];

  return [...new Set([resolvedModel, ...fallbackModels])];
}

function isProviderAuthUnavailable(error: unknown) {
  const typed = error as { status?: number; code?: string; error?: { code?: string }; message?: string };
  const message = typed?.message ?? String(error);
  return (
    typed?.code === "auth_unavailable" ||
    typed?.error?.code === "auth_unavailable" ||
    /auth_unavailable/i.test(message) ||
    /no auth available/i.test(message) ||
    /providers=codex/i.test(message)
  );
}

function extractChatContent(response: {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}) {
  return response.choices?.[0]?.message?.content?.trim() ?? "";
}

function buildMessages(prompt: string, systemPrompt?: string) {
  // 部分代理（例如 api.codexzh.com）对独立 system role 消息返回 400，
  // 所以将 system 指令拼接到 user 消息开头，保留强约束又兼容代理。
  const composedContent = systemPrompt
    ? `${systemPrompt.trim()}\n\n====\n\n${prompt}`
    : prompt;
  return [{ role: "user" as const, content: composedContent }];
}

async function requestChatCompletion(
  prompt: string,
  model: string,
  systemPrompt?: string,
) {
  const response = await getClient().chat.completions.create({
    model,
    messages: buildMessages(prompt, systemPrompt),
  }, {
    timeout: DEFAULT_REQUEST_TIMEOUT_MS,
  });

  const content = extractChatContent(response);
  if (content) {
    return {
      response,
      content,
    };
  }

  // 部分 OpenAI 兼容代理对 gpt-* 的非流式 Chat Completions 会返回
  // finish_reason=stop 但 message.content=null；同一模型走 stream 可以正常吐 delta.content。
  // 因此非流式空内容时，自动用流式请求收集完整文本，避免 UI 报“未返回文本内容”。
  const streamedContent = await requestStreamingChatCompletion(
    prompt,
    model,
    () => {},
    systemPrompt,
  );

  return {
    response,
    content: streamedContent,
  };
}

async function requestStreamingChatCompletion(
  prompt: string,
  model: string,
  onTextChunk: (chunk: string) => void,
  systemPrompt?: string,
  signal?: AbortSignal,
  onReasoningChunk?: (chunk: string) => void,
) {
  const stream = await getClient().chat.completions.create({
    model,
    stream: true,
    messages: buildMessages(prompt, systemPrompt),
  }, {
    timeout: STREAM_REQUEST_TIMEOUT_MS,
    signal,
  });

  let content = "";

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as
        | { content?: string | null; reasoning_content?: string | null }
        | undefined;
      const textDelta = delta?.content ?? "";
      const reasoningDelta = delta?.reasoning_content ?? "";

      if (reasoningDelta) {
        onReasoningChunk?.(reasoningDelta);
      }

      if (!textDelta) {
        continue;
      }

      content += textDelta;
      onTextChunk(textDelta);
    }
  } catch (error) {
    if (!content) {
      throw error;
    }
    console.warn("[openai] 流式输出中断，已保留已接收的部分内容", error);
  }

  return content.trim();
}

async function createTextCompletion(
  prompt: string,
  options?: TextCompletionOptions,
) {
  const requestedModel = options?.modelOverride ?? config.openAiModel;
  const modelCandidates = getProviderModelCandidates(requestedModel);
  let lastError: unknown = null;

  for (const [index, resolvedModel] of modelCandidates.entries()) {
    const aliased = resolvedModel !== requestedModel;
    options?.onResolvedModel?.(resolvedModel, aliased);

    if (options?.onTextChunk) {
      try {
        const streamed = await requestStreamingChatCompletion(
          prompt,
          resolvedModel,
          options.onTextChunk,
          options?.systemPrompt,
          options.streamSignal,
          options.onReasoningChunk,
        );

        if (streamed) {
          return streamed;
        }
      } catch (error) {
        lastError = error;
        console.warn("[openai] 流式输出失败或超时，回退到普通模式", error);

        if (isProviderAuthUnavailable(error) && index < modelCandidates.length - 1) {
          options.onStreamingFallback?.(
            new Error(`模型 ${resolvedModel} 鉴权不可用，自动切换到 ${modelCandidates[index + 1]}`),
          );
          continue;
        }

        options.onStreamingFallback?.(error);
      }
    }

    try {
      const result = await requestChatCompletion(
        prompt,
        resolvedModel,
        options?.systemPrompt,
      );
      if (result.content) {
        return result.content;
      }

      const finishReason = result.response.choices?.[0]?.finish_reason ?? "unknown";
      throw new Error(
        `OpenAI 未返回文本内容。当前模型：${resolvedModel}，finish_reason：${finishReason}`,
      );
    } catch (error) {
      lastError = error;
      if (isProviderAuthUnavailable(error) && index < modelCandidates.length - 1) {
        console.warn(
          `[openai] 模型 ${resolvedModel} 鉴权不可用，自动切换到 ${modelCandidates[index + 1]}`,
          error,
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "OpenAI 请求失败"));
}

export async function generatePrd(appName: string, description: string) {
  const prompt = applyTemplate(PRD_GENERATION_PROMPT, {
    appName,
    description,
  });

  return createTextCompletion(prompt);
}

export async function generateAndroidCode(
  prdContent: string,
  options?: TextCompletionOptions,
) {
  const prompt = applyTemplate(CODE_GENERATION_PROMPT, {
    prd_content: prdContent,
  });

  return createTextCompletion(prompt, {
    ...options,
    modelOverride: config.openAiCodeModel,
    systemPrompt: CODE_GENERATION_SYSTEM_PROMPT,
  });
}

export async function continueAndroidCodeFromPartial(
  prdContent: string,
  partialOutput: string,
  options?: TextCompletionOptions,
) {
  const tailSize = 18000;
  const tail = partialOutput.length > tailSize
    ? partialOutput.slice(-tailSize)
    : partialOutput;

  const prompt = `你上一次的流式输出在中途被网络中断截断，请直接续写剩余部分，补全成一个可编译的完整安卓工程。

需求文档（背景参考，已基于它生成了大部分文件）：
${prdContent}

已经生成的原始输出（末尾附近可能是一个未闭合的 \`\`\` 代码块）：
<<<PREVIOUS_OUTPUT_TAIL>>>
${tail}
<<<END_PREVIOUS_OUTPUT_TAIL>>>

续写严格要求：
1. 你的输出必须能直接拼接到上面 PREVIOUS_OUTPUT_TAIL 的末尾；
2. 禁止任何开场白、解释、推理、寒暄或 \`to=functions.*\`/JSON 指令；
3. 如果末尾的最后一个 \`\`\`相对路径 代码块还没有用收尾的 \`\`\` 闭合，请先输出该文件剩余的源码并用一行 \`\`\` 闭合它；
4. 然后继续按 CODE_GENERATION_SYSTEM_PROMPT 的格式依次输出尚未生成的文件（\`\`\`相对路径\\n文件内容\\n\`\`\`）；
5. 严禁重复输出已经完整闭合过的文件；
6. 保持与之前相同的包名、主题、导航结构与业务语义，不要替换成通用模板。`;

  return createTextCompletion(prompt, {
    ...options,
    modelOverride: config.openAiCodeModel,
    systemPrompt: CODE_GENERATION_SYSTEM_PROMPT,
  });
}

export async function regenerateAndroidCode(
  prdContent: string,
  invalidOutput: string,
  reason: string,
  options?: TextCompletionOptions,
) {
  const prompt = `请根据下面的需求文档重新输出完整的安卓工程源码。

需求文档：
${prdContent}

本次是重新生成，上一次输出被判定无效，原因：${reason}

上一次无效输出节选（仅供避免再犯）：
${invalidOutput.slice(0, 8000)}

请从此刻起立即输出 \`\`\`settings.gradle.kts\`\`\` 代码块，依次输出根 build.gradle.kts、gradle.properties、app/build.gradle.kts、AndroidManifest.xml、Kotlin 源码与资源。不要输出任何开场白、解释、计划或代理式工具调用（\`to=functions.*\`、\`{"cmd":...}\` 等一律禁止）。

Flow 组合硬性要求：Kotlin \`combine\` 独立 lambda 形参写法最多只能组合 5 个 Flow；6 个及以上 Flow 必须拆成嵌套 \`combine\` 或中间局部 flow，禁止输出 \`combine(a, b, c, d, e, f) { a, b, c, d, e, f -> ... }\` 或任何 6 个及以上 Flow + 多形参 lambda 的写法。`;

  return createTextCompletion(prompt, {
    ...options,
    modelOverride: config.openAiCodeModel,
    systemPrompt: CODE_GENERATION_SYSTEM_PROMPT,
  });
}

export async function repairAndroidProject(
  prdContent: string,
  buildError: string,
  projectContext: string,
  options?: TextCompletionOptions,
) {
  const prompt = `请修复一个已经生成但编译失败的安卓项目。

编译错误摘要（节选）：
${buildError.slice(-6000)}

需求文档（用于保留业务语义，不要重新实现）：
${prdContent}

当前工程上下文（优先包含出错文件的完整源码，以及 Gradle/Manifest 兜底）：
${projectContext}

修复任务要求（严格遵守）：
1. 只输出需要修改或新增的文件，每个文件必须是完整内容，不要输出 diff/patch/省略号；
2. 每个文件必须使用 \`\`\`相对路径\\n文件内容\\n\`\`\` 的格式，路径必须是 UNIX 风格；
3. 优先做最小修复，使项目能通过 \`./gradlew assembleDebug\`，保留当前项目的业务语义、页面结构、类名和包名；
3b. **严禁重命名 namespace / applicationId / package**：修复输出里 \`app/build.gradle.kts\` 中的 \`namespace\` 与 \`applicationId\` 必须与原工程一字不差；所有 \`.kt\` 文件顶部的 \`package\` 声明、\`AndroidManifest.xml\` 中的包引用、所有 \`app/src/main/java/\` 下的目录结构都必须保持与原工程完全一致。禁止把 \`com.example.allqrcode\` 改成 \`com.example.allinqr\` 或 \`com.example.allqr\` 之类的变体，禁止新增平行的包目录；
4. 修改 Kotlin 文件时，如文件里出现实验性 API（FlowRow、Material3 SearchBar、SegmentedButton、TopAppBar、CenterAlignedTopAppBar、TopAppBarDefaults 等），请在文件顶部 \`package\` 之上添加 \`@file:OptIn(...)\`，把所有需要的实验类都合并写在一个 OptIn 里；
4b. 如果报错是 \`@Composable invocations can only happen from the context of a @Composable function\`，优先检查是否把 \`stringResource\`、\`pluralStringResource\`、\`painterResource\` 放进了 \`onClick\`、\`LaunchedEffect\`、协程 lambda 等非 composable 回调；这类场景必须改成先在 composable 顶层求值，或使用 \`val context = LocalContext.current\` 后改为 \`context.getString(...)\`；
4c. 如果 \`onClick\` 中需要调用 suspend 函数，必须在当前 \`@Composable\` 顶层先声明 \`val scope = rememberCoroutineScope()\`，导入 \`androidx.compose.runtime.rememberCoroutineScope\` 与 \`kotlinx.coroutines.launch\`，再在回调里写 \`scope.launch { ... }\`。禁止在 \`onClick\` 内部调用 \`rememberCoroutineScope()\`，禁止直接在普通回调中调用 suspend 函数；
4d. 本地类 import 必须按实际 package 修正。若 \`AppViewModelFactory\` 等类声明在 \`ui.viewmodels\` 包，MainActivity 必须 import \`...ui.viewmodels.AppViewModelFactory\`，不要猜成 \`...ui.AppViewModelFactory\`；遇到不存在的 Material3 import（如 \`segmentedButtonColors\`、\`segmentedButtonItems\`）必须删除；
5. 遇到 \`Val cannot be reassigned\`+\`Type mismatch: inferred type is String but XxxType was expected\` 这类错误，通常是 \`Intent(...).apply { type = "..." }\` 内部的 \`type\` 与外层函数参数 \`type: XxxType\` 冲突，请改成 \`this.type = "..."\`；
6. 遇到 \`Unresolved reference: rememberSearchBarState\`，请删除相关 import 并用 \`remember { mutableStateOf("") }\` 替代；
7. ViewModel 中若出现类型不匹配（如 \`StateFlow<ScreenState<...>>\` 赋值为 \`MutableStateFlow<String>\`），重写该属性：用一条链式表达式 \`_state.combine(...).map { ... }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 初值)\` 直接返回目标类型，严禁用 \`.let { query }\` 把类型偷换；
7a. 如果 \`UiState.Success\` 是泛型 \`Success<T>\`，类型判断必须写 \`is UiState.Success<*>\`，不要写裸的 \`is UiState.Success\`；
7b. 遇到 \`combine\` 重载、\`Too many arguments\`、\`Cannot infer type\` 或 Flow 组合相关错误时，检查所有 \`combine\` 调用：独立 lambda 形参写法最多只能组合 5 个 Flow；6 个及以上 Flow 必须拆成嵌套 \`combine\` 或中间局部 flow，禁止写 \`combine(a, b, c, d, e, f) { a, b, c, d, e, f -> ... }\` 或任何 6 个及以上 Flow + 多形参 lambda 的代码；
7c. 链式扩展 \`.combine(...)\` 一次只能接 1 个额外 Flow。若代码写了 \`someFlow.combine(flowA, flowB) { existing, a, b -> ... }\`，必须改成顶层 \`combine(someFlow, flowA, flowB) { existing, a, b -> ... }\` 或拆成中间 Flow；
7d. **Kotlin 扩展函数调用形式**：\`kotlinx.coroutines.flow.first\` / \`last\` / \`single\` / \`toList\` / \`collect\` / \`map\` / \`filter\` / \`fold\` / \`reduce\` / \`count\` 等都是 Flow 的**扩展函数**，不能以包级函数形式调用。严禁写 \`kotlinx.coroutines.flow.first(myFlow)\`，必须写 \`myFlow.first()\` 并 import \`kotlinx.coroutines.flow.first\`。同理，\`kotlin.collections.first(list)\` 必须改为 \`list.first()\`。一旦报 \`Unresolved reference: first\` / \`loggedIn\` / \`userId\` 等多符号连锁错误，优先排查是不是有一行把扩展函数当包级函数用导致后续表达式类型崩塌；
7e. 如果错误是 "Unresolved reference: <属性名>"，且该属性在任何数据类中都不存在，必须修改数据类或调用处二选一：(a) 在数据类中补齐该字段并给出默认值；(b) 把调用处改为使用现有字段或合理默认值。严禁保留对未定义字段的引用；
8. 不要在修复过程中新增 Hilt、kapt、Compose BOM 之外的新版本；保持 compose-bom 2024.06.00 基线；若源码 import 了 \`androidx.compose.material.icons.\` 下的扩展图标，允许在 \`app/build.gradle.kts\` 中补 \`implementation("androidx.compose.material:material-icons-extended")\`；
8b. 修复 Gradle 时必须做“减法优先”：除 \`androidx.core:core-ktx:1.13.1\` 与 \`androidx.core:core-splashscreen:1.0.1\` 外，禁止新增或保留任何直接声明的 \`androidx.core:core-*\` / \`androidx.core:core\` 模块；如果看到 \`core-location-altitude\`、\`core-animation-testing\`、\`core-uwb\`、\`core-testing\`、\`core-performance-play-services\`、\`core-telecom\`、\`core-viewtree\` 等不存在或非必要依赖，必须删除，而不是继续添加依赖；
9. 不要输出与修复无关的文件，更不要输出整套模板项目。`;

  return createTextCompletion(prompt, {
    ...options,
    modelOverride: config.openAiCodeModel,
    systemPrompt: CODE_GENERATION_SYSTEM_PROMPT,
  });
}

export async function assistPrd(
  currentPrd: string,
  action: "regenerate" | "optimize" | "add-feature",
  context: { appName: string; description?: string | null; feature?: string },
) {
  if (action === "regenerate") {
    return generatePrd(context.appName, context.description ?? "");
  }

  if (action === "optimize") {
    return createTextCompletion(
      `你是资深产品经理。请在不改变原始结构的前提下优化以下安卓应用需求文档的专业度与表达准确性，保持 Markdown 格式。\n\n${currentPrd}`,
    );
  }

  return createTextCompletion(
    `你是资深产品经理。请将以下新增功能整合进现有安卓应用需求文档，保持原有 Markdown 章节结构，并补充优先级、页面设计和技术建议。\n\n新增功能：${context.feature ?? "请补充一个可落地的功能"}\n\n当前需求文档：\n${currentPrd}`,
  );
}
