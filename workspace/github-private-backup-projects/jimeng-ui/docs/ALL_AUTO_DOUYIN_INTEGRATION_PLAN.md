# all-auto-douyin-video 融合到 jimeng-ui 的详细设计文档

## 1. 目标

本文档用于说明如何将 `all-auto-douyin-video` 的后处理能力，稳定地融合进 `jimeng-ui` 项目，而不是把两个工作流简单拼接或整体搬运。

目标不是复制 skill 外壳，而是吸收其最有价值的成片能力：

- 旁白生成
- 音色选择
- 背景音乐混音
- Whisper 真同步字幕
- 硬字幕烧录
- 导出抖音可发布成片

融合后，`jimeng-ui` 继续作为主工作流编排层，负责：

- 题目输入 / 热榜抽题
- 提示词生成
- 首帧 / 尾帧 / 视频生成
- 任务状态管理
- 抖音发布配置生成与发布触发

而 `all-auto-douyin-video` 的能力将被重构为 `jimeng-ui` 内部的后处理子系统。

---

## 2. 为什么不能整体搬运

`all-auto-douyin-video` 是“全自动成片 skill”，本身包含完整的：

- 脚本解析
- 图像生成
- 视频段生成
- 拼接
- 配音
- 字幕
- 烧录
- 输出

但 `jimeng-ui` 已经实现了其中前半部分的重要能力：

- text2image 首帧
- image2image 尾帧
- frames2video / multimodal2video
- query_result 下载
- 任务状态流转
- UI 输入与任务列表
- 抖音发布配置写入

如果整体搬运，会产生以下问题：

1. **前半段能力重复**：会出现两套脚本生成、两套视频生成入口。
2. **状态机冲突**：skill 偏一次性流水线，`jimeng-ui` 偏可观察、可重试的任务系统。
3. **维护成本上升**：未来改一个视频生成环节，要维护两套逻辑。
4. **产品边界变乱**：UI 上难以解释到底使用的是“即梦链路”还是“douyin 全自动链路”。

因此正确方法是：

> 保留 `jimeng-ui` 作为主工作流，只将 `all-auto-douyin-video` 拆分为后处理能力模块。

---

## 3. 融合总原则

### 原则一：即梦负责“生成”

`jimeng-ui` 现有链路继续负责：

- 生成首帧
- 生成尾帧
- 生成视频
- 下载结果

### 原则二：douyin skill 负责“精加工”

吸收 `all-auto-douyin-video` 的能力用于：

- 旁白
- 字幕
- 混音
- 烧录
- 成片导出

### 原则三：通过策略层接入，而不是散落在主文件中

现有文档已经有“后处理策略层”概念：

- 纯画面模式
- 点题字幕模式
- 解说模式

建议将其真正代码化，形成稳定策略接口。

---

## 4. 建议架构

建议在 `jimeng-ui` 内部增加如下目录：

```text
ui/
  postprocess/
    __init__.py
    base.py
    narration.py
    subtitle_sync.py
    burn_subtitles.py
    audio_mix.py
    composer.py
    strategies/
      __init__.py
      pure_visual.py
      theme_subtitle.py
      narrated.py
```

### 4.1 模块职责

#### `base.py`
定义后处理策略接口，例如：

- 输入：任务状态、视频路径、封面路径、模式参数
- 输出：最终成片路径、封面路径、产物列表、日志

#### `narration.py`
负责：

- 根据任务内容生成旁白文案
- 按总时长压缩文案长度
- 基于角色/情绪选择音色
- 调用 TTS 生成旁白音频

#### `audio_mix.py`
负责：

- 加载旁白与 BGM
- 统一音量策略
- 使用 `amix=inputs=2:duration=longest`
- 输出 `mixed_audio.wav/mp3`

#### `subtitle_sync.py`
负责：

- 对最终旁白音频运行 Whisper
- 输出 `srt`
- 可选做字幕清洗 / 合并 / 断句优化

#### `burn_subtitles.py`
负责：

- 检测当前 ffmpeg 是否支持 `subtitles` / `ass`
- 若支持，则硬烧录字幕
- 若不支持，则走备用方案（自绘字幕或外挂字幕交付）

#### `composer.py`
负责：

- 将最终视频、混音、字幕结果整合
- 选择最终成片命名规则
- 输出 `final_mastered.mp4` / `final_with_external_subtitles.mp4`

---

## 5. 建议策略层设计

### 5.1 抽象接口

建议定义统一接口，例如：

```python
class PostprocessStrategy:
    def run(self, job_state, video_path, cover_path) -> PostprocessResult:
        ...
```

返回结构建议包含：

- `final_video`
- `cover_path`
- `subtitle_path`
- `narration_audio`
- `mixed_audio`
- `mode`
- `logs`
- `artifacts`

### 5.2 具体策略

#### `PureVisualStrategy`
适用：
- 空镜
- 纯情绪片
- 不需要配音

处理：
- 不生成旁白
- 不强制字幕
- 直接输出原视频或轻微母版处理结果

#### `ThemeSubtitleStrategy`
适用：
- 点题短片
- 情绪表达短片

处理：
- 不生成旁白
- 只生成少量标题/结尾字幕
- 尽量轻量烧录

#### `NarratedStrategy`
适用：
- 观点输出
- 讲解视频
- 叙事类短片

处理：
- 生成旁白文案
- 选择音色
- TTS
- Whisper 对齐
- 混音
- 硬字幕烧录
- 输出最终抖音成片

### 5.3 与 `all-auto-douyin-video` 的对应关系

`all-auto-douyin-video` 最值得复用的是 `NarratedStrategy` 的实现逻辑。

也就是说：

> `all-auto-douyin-video` 的核心价值，不是“全自动生成”，而是“解说模式后处理链路”。

---

## 6. 推荐状态机扩展

当前 `docs/WORKFLOW.md` 已有较粗粒度状态。建议细化，方便 UI 展示和失败重试。

新增建议状态：

- `narration_script_ready`
- `voice_selected`
- `narration_audio_ready`
- `subtitle_srt_ready`
- `subtitle_burn_ready`
- `mixed_audio_ready`
- `final_mastered_ready`
- `publish_ready`
- `publish_running`
- `publish_done`
- `publish_failed`

这样 UI 能明确告诉用户卡在哪一步，而不是只知道“后处理失败”。

---

## 7. 文案与音色设计

这是融合里最重要的一块之一。

### 7.1 旁白文案生成

建议不要直接把输入题目原样喂给 TTS，而是增加一个中间步骤：

- 输入：主题、视频总时长、后处理模式、语气标签
- 输出：适合口播的短句文案

需要满足：

- 每句长度适中
- 停顿位置自然
- 避免书面腔
- 总字数与视频时长匹配
- 听起来像真实人在说，而不是“AI 在念文案”

建议按经验控制：

- 15 秒视频：约 45~75 字中文旁白
- 30 秒视频：约 90~150 字

当前代码第一版已接入“按时长压缩旁白文本”的规则层，优先截取自然句段，避免文案过长导致念白拥挤。

### 7.2 音色选择

建议不要写死一个 voice，而是做简单规则层：

输入特征：
- 主体性别
- 年龄感
- 视频气质（纪录片 / 情绪 / 热血 / 悬疑 / 治愈）
- 节奏快慢

输出：
- TTS voice 名称
- 语速
- 音量基线

第一版可以先规则化，而不是上复杂模型判断。

例如：
- 情绪电影感：低沉、慢一点
- 女性治愈：柔和、清晰
- 快节奏讲解：更干脆、偏中性

### 7.3 默认音色策略

如果暂时保持与 skill 一致，理想方案是：

- `tts-1-hd`
- `nova`

但当前项目现状中，旧链路仍以本地 TTS / gTTS / `say` 兜底。

因此建议分两层：

- 第一优先级：高质量在线 TTS（后续接 OpenAI 风格接口）
- 第二优先级：本地 `say`
- 第三优先级：gTTS 兜底

当前代码第一版已补上：
- 旁白文本自然化压缩
- BGM + narration 混音
- 更适合真实口播的输出路径

---

## 8. 字幕对齐与烧录设计

### 8.1 Whisper 真同步字幕

保留 `all-auto-douyin-video` 的优点：

- 先生成真实旁白音频
- 再对音频转写生成 SRT

而不是：
- 先写字幕时间轴
- 再强行匹配配音

这是保证观感自然的关键。

### 8.2 字幕风格建议

建议默认输出电影感白字字幕：

- 白色主字
- 黑色轻描边或阴影
- 底部居中
- 控制每行字数
- 适合竖屏安全区

### 8.3 ffmpeg 兼容问题

你的 `docs/WORKFLOW.md` 已经注明：

- 当前机器 ffmpeg 可能缺少 `subtitles/ass` filter

因此融合设计必须包含降级策略：

#### 优先路径
- `ffmpeg-full` + `libass` 硬字幕烧录

#### 降级路径 A
- 生成外挂字幕 `srt`
- 输出 `final_with_external_subtitles.mp4`

#### 降级路径 B
- 使用自绘字幕（后续可做）
- 即 Python/Pillow 逐帧或按时间段叠字

系统必须把“当前采用哪种字幕交付方式”写回任务结果。

---

## 9. 音频混音设计

建议直接继承 `all-auto-douyin-video` 的关键实现经验：

```text
amix=inputs=2:duration=longest
```

不要用 `duration=first`。

原因：
- 如果旁白短于视频，`duration=first` 会导致整体音频提前截断
- 进而可能导致最终视频时长处理异常

建议混音策略：

- 旁白音量优先
- BGM 默认降低到 -18dB 到 -24dB 范围
- 关键口播段可后续加 ducking（第一版可不做）

输出建议：
- `voiceover.wav`
- `bgm_trimmed.mp3`
- `mixed_audio.wav`

---

## 10. 与发布链路的关系

目前 `jimeng-ui` 已经具备：

- 生成 `douyin_publish.json`
- 调用外部 Node 发布器

融合后不建议改动发布接口契约，而是让后处理层更可靠地输出：

- 最终视频路径
- 最终封面路径
- 发布标题
- 发布描述
- 标签

即：

> 发布层保持稳定，后处理层增强最终成片质量。

这样风险最低。

---

## 11. 推荐实现顺序

### Phase 1：结构整理

先把后处理目录和策略接口建起来。

### Phase 2：旁白链路接入

接入：
- 文案适配
- TTS
- 音色规则

### Phase 3：字幕链路接入

接入：
- Whisper 转写
- SRT 输出
- 字幕样式处理

### Phase 4：混音与硬字幕

接入：
- narration + bgm 混音
- ffmpeg 烧录
- 降级路径

### Phase 5：状态机 / UI 可观测性

在 UI 中展示：
- 当前后处理阶段
- 日志
- 中间产物
- 失败原因

### Phase 6：发布联调

保证最终成片能直接进入现有 `douyin_publish.json` 链路。

---

## 12. 不建议做的事

以下几种做法不建议：

### 12.1 不建议把 skill 脚本整份复制进项目

原因：
- 难维护
- 风格不统一
- 状态管理不兼容

### 12.2 不建议把旁白/字幕逻辑硬编码进 `jimeng_ui_app.py`

原因：
- 主文件会越来越大
- 不利于后续拆分和测试

### 12.3 不建议第一版就做过度复杂的 AI 判定

例如：
- 情绪识别模型
- 高级镜头理解
- 自动配乐生成

第一版应优先把：
- 路径打通
- 状态稳定
- 可观察

做好。

---

## 13. 第一版最小可用融合方案

如果要最快落地，建议第一版只做：

1. 在 `NarratedStrategy` 中接入 TTS
2. 用 Whisper 生成 `srt`
3. 用 `ffmpeg-full` 尝试硬字幕
4. 用 `amix=duration=longest` 做混音
5. 产出：
   - `voiceover.wav`
   - `subtitles.srt`
   - `mixed_audio.wav`
   - `final_mastered.mp4`

这就足够把 `all-auto-douyin-video` 的最关键价值吸收进来。

---

## 14. 结论

最佳融合策略不是“把 `all-auto-douyin-video` 变成第二套视频工作流”，而是：

> 把它拆成 `jimeng-ui` 的后处理能力层，重点落在 `NarratedStrategy`。

最终分工应该是：

- `jimeng-ui`：主编排、生成、状态机、发布
- `all-auto-douyin-video` 经验沉淀：旁白、字幕、混音、烧录

这是当前最稳、最省改造成本、也最容易长期维护的方案。
