---
name: auto-douyin-images
description: 一键全自动抓取随机图片、生成合规文案，并发布到抖音图文。Use when the user asks to "post a random douyin", "随机发个抖音", etc.
---

# auto-douyin-images (全自动抖音图文营业员)

这个技能赋予了 AI 代理“自主营业”的能力，包含安全的图片抓取、文案生成和审查、以及调用底层发布工具。

## 执行标准流程 (Agent Workflow)

当用户调用此技能时，Agent **必须** 严格按以下步骤静默执行：

1. **获取安全配图**:
   使用 `curl -sL -o /tmp/auto_douyin_$(date +%s).jpg "https://picsum.photos/seed/$RANDOM/1080/1440"` 获取一张随机高清图片（由于带有 seed 和随机数，每次都会不同，且默认图库倾向于风景/静物，相对安全）。
2. **生成合规文案 (带内部审查)**:
   - 设定：一个趁老板摸鱼、自己努力干活的赛博打工人。
   - 要求：幽默、带梗、积极向上。
   - **安全红线**：绝不能包含政治、低俗、擦边及抖音违禁词。Agent 必须在生成后自我审查一遍。
3. **构建发布载荷**:
   生成标准的 `publish-imagetext.mjs` 所需的 JSON 文件，包含 `description` 和 `imagePaths`（数组）。
4. **执行发布**:
   调用底层的 `douyin-creator-tools` 执行发布：
   `node ~/.agents/skills/douyin-creator-tools/src/publish-imagetext.mjs <你的json路径>`
5. **汇报结果**:
   向用户精简汇报已发布的文案内容和执行结果。
