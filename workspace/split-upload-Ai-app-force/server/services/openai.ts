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
  onResolvedModel?: (model: string, aliased: boolean) => void;
  modelOverride?: string;
  streamSignal?: AbortSignal;
  systemPrompt?: string;
}

let client: OpenAI | null = null;
const STREAM_REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;

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
  if (
    config.openAiBaseUrl.includes("api.codexzh.com") &&
    !model.startsWith("cc-")
  ) {
    return `cc-${model}`;
  }

  return model;
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

  return {
    response,
    content: extractChatContent(response),
  };
}

async function requestStreamingChatCompletion(
  prompt: string,
  model: string,
  onTextChunk: (chunk: string) => void,
  systemPrompt?: string,
  signal?: AbortSignal,
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

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (!delta) {
      continue;
    }

    content += delta;
    onTextChunk(delta);
  }

  return content.trim();
}

async function createTextCompletion(
  prompt: string,
  options?: TextCompletionOptions,
) {
  const requestedModel = options?.modelOverride ?? config.openAiModel;
  const resolvedModel = resolveProviderModel(requestedModel);
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
      );

      if (streamed) {
        return streamed;
      }
    } catch (error) {
      console.warn("[openai] 流式输出失败或超时，回退到普通模式", error);
    }
  }

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

请从此刻起立即输出 \`\`\`settings.gradle.kts\`\`\` 代码块，依次输出根 build.gradle.kts、gradle.properties、app/build.gradle.kts、AndroidManifest.xml、Kotlin 源码与资源。不要输出任何开场白、解释、计划或代理式工具调用（\`to=functions.*\`、\`{"cmd":...}\` 等一律禁止）。`;

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

需求文档：
${prdContent}

当前编译错误：
${buildError}

当前工程关键文件：
${projectContext}

任务要求：
1. 只输出需要修改或新增的文件，保持与 CODE_GENERATION_SYSTEM_PROMPT 相同的输出规则；
2. 每个文件必须使用 \`\`\`相对路径\\n文件内容\\n\`\`\` 的格式；
3. 优先做最小修复，使项目能够通过 ./gradlew assembleDebug；
4. 保留并修复当前项目的业务语义、页面结构与功能，不要替换成通用模板应用；
5. 不要输出与修复无关的文件。`;

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
