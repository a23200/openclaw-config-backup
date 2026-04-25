# 抖音发布方式与流程说明

本文档用于说明 `jimeng-ui` 当前“发布到抖音”的实现方式、触发条件、配置文件格式、运行流程、失败点与后续建议。

适用对象：
- 继续开发此项目的代码工具 / Agent
- 后续接手的前后端开发者
- 需要理解当前发布链路边界的维护者

---

## 1. 当前发布方式概览

当前项目中的抖音发布，不是浏览器页面内直接上传，而是采用：

1. 即梦工作流先生成最终视频产物
2. 后处理阶段确定最终交付视频
3. 本地生成一份 `douyin_publish.json`
4. 调用本机已有的 Node 发布脚本完成抖音发布

也就是说，`jimeng-ui` 当前承担的是：
- 任务编排
- 发布参数收集
- 发布配置文件生成
- 调用外部发布器

而不是自己在 FastAPI 内部直接实现完整抖音上传协议。

---

## 2. 当前代码中的关键实现位置

### 2.1 发布配置文件生成
文件：`ui/jimeng_ui_app.py`

核心函数：
- `write_publish_json(folder: Path, state: dict[str, Any], final_video: Path, cover_path: Path) -> Path`

用途：
- 根据当前任务状态生成抖音发布所需 JSON 配置
- 输出文件名：`douyin_publish.json`

当前写出的字段包括：
- `videoPath`：最终视频文件路径
- `title`：发布标题
- `description`：发布描述
- `tags`：默认标签数组
- `coverPath`：封面图路径

---

### 2.2 实际调用发布脚本
文件：`ui/jimeng_ui_app.py`

核心函数：
- `publish_to_douyin(config_path: Path) -> subprocess.CompletedProcess[str]`

当前调用方式：
```python
node /Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs <config_path>
```

说明：
- `jimeng-ui` 并不直接上传抖音
- 它依赖本机外部脚本：
  ` /Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs `
- 所以此项目能否成功发布，除了 UI/后端逻辑，还依赖：
  - 本机 Node 可用
  - 上述脚本存在
  - 脚本所需浏览器环境/登录态可用
  - 抖音创作者后台当前页面结构未发生破坏性变化

---

## 3. 发布触发条件

当前任务创建表单中有以下发布相关字段：
- `publish_title`
- `publish_description`
- `auto_publish`

逻辑上：
- 如果用户勾选 `auto_publish`
- 并且视频工作流完成到可交付阶段
- 系统会进入发布阶段：
  - 生成 `douyin_publish.json`
  - 调用抖音发布脚本
  - 将结果写回状态或日志

当前发布区的定位是“自动发布开关 + 基础元数据输入”，而不是复杂的发布编排台。

---

## 4. 当前发布链路的实际流程

### Stage 1：生成最终可发布视频
根据任务模式不同，系统会先得到以下其中一种结果：
- `final.mp4`
- `final_mastered.mp4`
- `final_with_external_subtitles.mp4`

其中：
- `final_mastered.mp4` 理论上是最理想的抖音发布成片
- 如果本机 `ffmpeg` 不支持硬字幕烧录，则可能退化为：
  - `final.mp4`
  - 或 `final_with_external_subtitles.mp4`

因此当前发布链路并不保证一定是“硬字幕最终成片”，而是以“当前最可交付的视频”作为输入。

---

### Stage 2：确定封面
当前实现中需要一个 `coverPath`。

通常可用来源包括：
- 首帧 `first_frame.png`
- 尾帧 `last_frame.png`
- 或其他生成阶段留下的封面候选图

推荐默认策略：
- 优先使用 `last_frame.png`（更接近最终情绪落点）
- 若不存在则回退到 `first_frame.png`

---

### Stage 3：生成 `douyin_publish.json`
示例结构：

```json
{
  "videoPath": "/path/to/final.mp4",
  "title": "一个有情绪张力的标题",
  "description": "一条关于某个主题的短片。#即梦 #AI短片 #电影感",
  "tags": ["即梦", "AI短片", "电影感"],
  "coverPath": "/path/to/cover.png"
}
```

该文件是 `jimeng-ui` 与外部抖音发布脚本之间的接口契约。

---

### Stage 4：调用外部 Node 发布脚本
调用命令：

```bash
node /Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs /path/to/douyin_publish.json
```

理论上该脚本负责：
- 读取 JSON 配置
- 打开/连接浏览器
- 进入抖音创作者发布页面
- 上传视频
- 填写标题与描述
- 设置封面（如果脚本支持）
- 点击发布或提交

注意：这些能力不在 `jimeng-ui` 代码内部，而在外部脚本内部。

---

## 5. 当前依赖与外部环境前提

要让“发布到抖音”真正可用，当前机器至少需要满足：

### 5.1 Node 环境
需要可执行：
```bash
node
```

### 5.2 外部发布脚本存在
需要存在：
```bash
/Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs
```

### 5.3 浏览器登录态有效
如果外部发布脚本采用浏览器自动化方式，则通常需要：
- 抖音创作者后台已登录
- 浏览器 profile / cookie 未失效
- 站点没有出现验证码、风控、二次确认

### 5.4 可上传的视频与封面文件真实存在
包括：
- `videoPath` 文件必须存在
- `coverPath` 文件必须存在
- 文件路径不能失效

---

## 6. 当前已知问题与边界

### 6.1 发布能力依赖外部脚本，耦合较强
当前项目无法单独完成抖音发布，必须依赖本机某个固定路径下的脚本。

这意味着：
- 换机器后可能直接失效
- 换开发者环境后可能找不到脚本
- 脚本升级后 JSON 契约可能变化

### 6.2 UI 无法直接看到完整发布过程细节
目前 UI 更像“发起发布”而不是“精细可观测发布台”。

理想上后续应该补：
- 发布日志
- 发布耗时
- 当前步骤（打开页面 / 上传视频 / 填写文案 / 提交）
- 失败截图
- 最终发布结果链接

### 6.3 硬字幕失败会影响最终发布素材质量
当前本机有一个明确限制：
- `ffmpeg` 缺少 `subtitles/ass` 或对应烧录能力

因此：
- 最终可能只能发布纯视频 + 外挂字幕版本
- 或发布无硬字幕成片

这对最终抖音成片效果有直接影响。

### 6.4 自动发布不适合直接放到生产
因为浏览器自动发布涉及：
- 登录态
- 平台风控
- 页面结构变更
- 不可预期的人机验证

所以当前更适合作为：
- 内测链路
- 可人工兜底的半自动发布
- 开发期演示流程

而不适合作为零监控的生产自动化发布系统。

---

## 7. 推荐的后续工程化改造方向

### 7.1 抽象发布器接口
建议把当前“抖音发布”抽象成独立发布层，例如：
- `Publisher` 抽象接口
- `DouyinPublisher` 具体实现
- 后续支持其他平台（快手 / 视频号 / 小红书）

目标：
- 不把平台发布逻辑写死在 `jimeng_ui_app.py`
- 便于替换实现
- 便于测试

---

### 7.2 在项目内固化配置契约
建议单独定义：
- `publish_schema.json`
- 或 `pydantic` 的 PublishConfig 模型

用于明确：
- 哪些字段是必填
- 哪些字段可选
- 标题/描述长度限制
- 封面是否必传

这样开发工具接手时不会猜契约。

---

### 7.3 增加发布日志文件
建议每次发布都写：
- `douyin_publish.json`
- `douyin_publish.log`
- `douyin_publish_result.json`

推荐字段：
- 开始时间
- 结束时间
- 发布状态
- 失败原因
- 重试次数
- 返回链接
- 截图路径

---

### 7.4 增加人工确认模式
建议把发布增加为两种模式：

1. `auto_publish=true`
   - 成片完成后直接触发发布

2. `manual_publish`
   - 先准备好配置与视频
   - 由用户在 UI 中点击“确认发布”

这会更适合生产使用。

---

### 7.5 为开发工具保留稳定入口
如果后续要让专业开发工具持续接手，建议保留以下稳定文件：
- `docs/WORKFLOW.md`
- `docs/DOUYIN_PUBLISH_FLOW.md`
- `docs/UI_FUNCTIONS.md`
- `docs/TODO.md`

其中本文件专门回答一个问题：
**“这个项目当前是如何把视频发布到抖音的？”**

---

## 8. 给后续开发工具的简短结论

一句话总结：

> 当前 `jimeng-ui` 的“发布到抖音”是通过生成 `douyin_publish.json`，再调用外部 Node 自动化脚本完成浏览器态发布；UI/后端本身并不直接实现抖音上传协议。

开发工具在继续改造时，应优先关注：
- 发布配置契约是否稳定
- 外部脚本路径是否固定
- 发布日志是否可观测
- 是否需要改成半自动发布而不是全自动直发

---

## 9. 建议补充到代码结构中的后续任务

建议追加到后续开发待办：
- 抽象独立 `publisher` 模块
- 增加发布日志与结果回写
- 支持 `manual_publish`
- 支持封面来源选择
- 支持平台返回链接展示
- 支持失败截图归档
- 降低对固定绝对路径脚本的依赖
