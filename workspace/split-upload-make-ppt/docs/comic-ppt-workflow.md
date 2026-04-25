# 漫画风 PPT 模板工作流

## 目标

当网站里选择 `漫画风 PPT` 模板时，不走普通商务模板链路，而是走「参考图 + Gemini 真生图 + 图文融合」专用流程。

## 模板入口

- 前端模板键：`comic_manga_ppt`
- 前端页面：`/Users/mac/Desktop/make-ppt/src/app-factory/index.html`
- 后端服务：`/Users/mac/Desktop/make-ppt/scripts/app-factory-preview.cjs`
- 生图脚本：`/Users/mac/Desktop/make-ppt/scripts/build_comic_manga_ppt.py`

## 固定要求

1. 必须把参考图喂给 Google/Gemini 生图模型。
2. 文字必须尽量在生图时直接出在图里，不能再退回“本地叠大标题”的假生图方案。
3. 画面风格要偏「商业漫画 / 管理层信息图」，不是儿童卡通，也不是普通商务模板。
4. 默认避免大量“小人吉祥物”，优先用模块、箭头、卡片、图谱、仪表盘来讲故事。
5. 页数由文档内容自动判断，不再按固定 7 页硬切。

## 参考素材

优先读取仓库与归档中的本地参考图：

- 主风格参考：`/Users/mac/Desktop/make-ppt/归档/2026-04-15-generated-assets/desktop-generated/参考图-大模型能力突然变强.png`
- 补充布局参考：优先使用 `runtime/image-ppt-demo/` 下最近成功样张中的第 2 页图片

如果显式漫画模板链路下参考图缺失，应直接报错，不允许静默回退成本地拼图。

## 后端执行步骤

1. 上传文档并创建项目目录。
2. 把 Word/PDF/文本转成 Markdown。
3. 根据 Markdown 标题结构自动规划漫画页数与每页主题。
4. 每页调用 Gemini 生图，并把精简后的中文标题/要点直接交给模型出字。
5. 保存：
   - 原始 Gemini 底图
   - 最终页图
   - `slide-plan.json`
   - `gemini-prompts.json`
   - `outline.md`
   - `RESULT.json`
   - 最终 `.pptx`

## 进度阶段

前端需要轮询并展示这些阶段：

- `queued`
- `prepare_markdown`
- `plan_story`
- `generate_pages`
- `package_ppt`
- `completed` / `failed`

其中 `generate_pages` 需要尽量带上 `current/total`，显示“第 X/N 页”。

同时前端在状态区下方要持续输出流式日志，至少包含：

- 文档分析结果
- 设计思路
- 当前页面生成计划
- 打包导出状态

## 当前约束

- 漫画模板目前默认要求源文档先转为 Markdown，再进入生图规划。
- 普通模板仍可继续走 `Plus AI` 或 `PPT Master`。
- 漫画模板的结果产物统一放在项目目录下的 `comic-assets/` 与 `exports/` 中。
