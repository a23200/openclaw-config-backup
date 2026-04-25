import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  buildCompactSourceDigest,
  buildPromptSource,
  estimateUtf8Bytes,
} = require("../scripts/lib/app-factory-prompt.cjs") as {
  buildCompactSourceDigest: (input: string, options?: Record<string, unknown>) => string;
  buildPromptSource: (
    input: string,
    options?: Record<string, unknown>,
  ) => { text: string; mode: string; bytes: number };
  estimateUtf8Bytes: (input: string) => number;
};

test("buildCompactSourceDigest keeps headings and numeric facts under budget", () => {
  const markdown = [
    "# AI 项目复盘",
    "",
    ...Array.from({ length: 18 }, (_, index) =>
      [
        `## 章节 ${index + 1}`,
        `- 核心指标：转化率 ${32 + index}%`,
        `- 关键时间：2026-04-${String((index % 28) + 1).padStart(2, "0")}`,
        `本章节总结预算 ${(index + 1) * 100} 万元、活跃用户 ${1800 + index * 260} 人，以及下一阶段执行动作。`,
      ].join("\n"),
    ),
  ].join("\n\n");

  const digest = buildCompactSourceDigest(markdown, { maxChars: 2200 });
  assert.ok(digest.length <= 2200);
  assert.match(digest, /AI 项目复盘/);
  assert.match(digest, /转化率/);
  assert.match(digest, /2026-04/);
});

test("buildPromptSource switches long markdown to digest mode", () => {
  const markdown = [
    "# 年度经营汇报",
    "",
    ...Array.from({ length: 24 }, (_, index) =>
      [
        `## 模块 ${index + 1}`,
        `- 收入增长 ${(index + 3) * 5}%`,
        `- 成本下降 ${(index + 2) * 3}%`,
        `这一段包含详细复盘、交付路径、预算 ${(index + 1) * 80} 万元、里程碑日期 2026-05-${String((index % 28) + 1).padStart(2, "0")}。`,
      ].join("\n"),
    ),
  ].join("\n\n");

  const source = buildPromptSource(markdown, { maxChars: 2400, preferFullChars: 1200 });
  assert.equal(source.mode, "digest");
  assert.ok(source.text.length <= 2400);
  assert.ok(source.bytes <= estimateUtf8Bytes(source.text));
  assert.match(source.text, /收入增长/);
});

test("buildPromptSource keeps short markdown readable", () => {
  const markdown = "# 项目摘要\n\n- 目标：提升成交率\n- 周期：两周";
  const source = buildPromptSource(markdown, { maxChars: 800, preferFullChars: 400 });
  assert.equal(source.mode, "full");
  assert.equal(source.text, markdown);
});
