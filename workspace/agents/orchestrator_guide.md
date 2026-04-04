# 🧠 Orchestrator Guide (主控调度指南) - 严格隔离版

## 目录隔离机制
为了防止文件覆盖和串台，所有 Agent **必须**在自己的独立目录下运行。跨 Agent 传递文件统一通过 `shared` 目录。

- **内容生成员**: `/Users/mac/.openclaw/workspace/agents/content/` (只在此生成原始视频、图片、音频)
- **剪辑排障员**: `/Users/mac/.openclaw/workspace/agents/media/` (只在此处理 ffmpeg 拼接、打字幕)
- **机甲控制员**: `/Users/mac/.openclaw/workspace/agents/robotics/` (执行脚本、日志存放)
- **发布运营员**: `/Users/mac/.openclaw/workspace/agents/publishing/` (打包、发版、缓存)
- **跨部门交接区**: `/Users/mac/.openclaw/workspace/agents/shared/` (只允许在这里读取上一个节点的成品)

## 调度机制 (Spawn)
作为主控 (Laodi)，你可以使用 OpenClaw 的 `sessions_spawn` 工具唤起 Sub-Agent。**关键是必须指定 `cwd` 参数！**

### 示例代码 (调度内容生成员)
```json
{
  "runtime": "subagent",
  "cwd": "/Users/mac/.openclaw/workspace/agents/content",  // 强制限定工作目录
  "task": "读取本目录下的 SOP.md，生成春日风光视频。完成后将最终的原始 MP4 移动到 ../shared/ 下，并向我返回 shared 目录下的绝对路径。",
  "label": "Agent-Content",
  "cleanup": "keep"
}
```

### 协作流转 (交接班)
1. **生成阶段**：在 `content` 目录拉起 Content Agent。它生成完后，把成品复制到 `agents/shared/raw_video_001.mp4`，返回路径给你。
2. **挂起等待**：主控调用 `sessions_yield`，拿到成品路径。
3. **剪辑阶段**：在 `media` 目录拉起 Media Agent，让它去 `shared` 目录拿原片，在它自己的 `media` 目录处理，搞定后输出到 `agents/shared/final_video_001.mp4`。
4. **发布阶段**：在 `publishing` 目录拉起 Publishing Agent，让它去 `shared` 目录拿最终版发抖音。

**核心原则**：各回各家，各找各妈。谁在谁的目录干活，交接去 Shared，绝对不许跨目录读写对方的半成品！
