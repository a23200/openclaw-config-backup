# All-Auto Douyin Video Generator (Veo Edition)

这是一个全自动的短视频生成工具，专为抖音、视频号等竖屏平台设计。只需提供一份纯文本的简易剧本，本工具将自动完成画图、视频生成、配音、混音、真同步字幕与后期合成，最终一键输出高质量的 9:16 MP4 成片。

## 🌟 核心技术管线

1. **分镜底图生成 (Text-to-Image)**: 借助 OpenAI DALL-E 3，根据你填写的固定场景和具体分镜，生成 1024x1792 分辨率的标准竖屏底图。
2. **视频片段生成 (Image-to-Video)**: 借助 Google Gemini Veo 模型，将静态底图精准转化为高质量的动态视频片段。
3. **旁白配音 (TTS)**: 借助 OpenAI TTS-1 模型，将你的文字旁白转化为生动的人声配音。
4. **音频混音 (Audio Mix)**: 自动将旁白与背景音乐混合，并压低 BGM 音量，保证人声清晰。
5. **真同步字幕 (Whisper + Burn-in)**: 先从最终音频中抽取旁白，再用本地 Whisper 生成带时间轴的字幕（**解决 macOS libomp 崩溃问题：需配置环境变量 `KMP_DUPLICATE_LIB_OK=TRUE`**），最后用 ffmpeg-full 将字幕直接烧录进画面。
6. **后期自动合成 (Assembly)**: 借助 FFmpeg/ffmpeg-full 完成视频拼接、音视频合并与带字幕成片输出。**混音阶段必须使用 `duration=longest` 以防画面被短旁白腰斩**。

## 📦 安装与环境配置

1. 安装必要的系统依赖（MacOS 推荐）：
   ```bash
   brew install ffmpeg ffmpeg-full openai-whisper
   ```

2. 在虚拟环境中安装 Python 依赖：
   ```bash
   pip install openai google-genai requests pillow
   ```

3. 推荐使用固定本地配置文件，而不是每次手动 export：
   新建文件：
   ```bash
   /Users/mac/.openclaw/workspace/.env.local
   ```
   内容如下：
   ```bash
   OPENAI_API_KEY=sk-...
   GOOGLE_API_KEY=AIza...
   ```

4. `run.py` 现在会优先自动读取：
   ```bash
   /Users/mac/.openclaw/workspace/.env.local
   ```
   如果这个文件不存在，才会回退到系统环境变量。

## 📝 剧本格式示例 (script.txt)

在运行前，请准备一个文本文件（必须包含以下四个区块）：

```text
固定场景/角色：
一个充满活力的、梦幻般的童话世界，所有东西都是用柔和的粉彩色调绘制的。

镜头描述：
1. 广阔的樱花树下，花瓣像雪一样轻轻飘落，天空是柔和的淡蓝色。
2. 一簇明亮的黄色连翘花的特写，上面还挂着晨露，背景是柔和模糊的绿色。
3. 镜头拉远，展现出一片由各种粉彩花朵组成的大地。夕阳西下，金色的阳光洒下。

旁白文案：
有人说，春天是绿色的，是万物复苏的颜色。但我觉得，春天更应该是一幅温柔的粉彩画。粉色的樱花，淡蓝的天空，鹅黄的连翘，组成了春天最美的诗篇。

背景音乐：
/Users/mac/Downloads/your-bgm.mp3
```

> **注意**：由于目前 Google Veo API (预览版) 具有极其严格的“Responsible AI”安全审查，请尽量避免在镜头描述中出现特定的人物着装、肤色等可能触发误判的描写。多使用纯风景或意象空镜可大幅提高生成成功率。

## ▶️ 运行方式

推荐直接使用 skill 自带虚拟环境：

```bash
/Users/mac/.agents/skills/all-auto-douyin-video/venv/bin/python run.py /path/to/your/script.txt
```

最终通常会输出：
- 原始成片：`douyin_video_YYYYMMDD_HHMMSS.mp4`
- 真同步字幕版：可基于同名视频继续生成带时间轴烧录字幕版本

## ✅ 当前已融合的增强能力

- 自动读取 `/Users/mac/.openclaw/workspace/.env.local`
- 支持本地 Whisper 生成时间轴字幕
- 支持使用 `ffmpeg-full` 进行烧录字幕
- 已验证可生成“真同步字幕版”成片
- 已新增热榜抓取前置模块骨架：`scripts/fetch_douyin_hot.py`
- 已新增第三方热榜源可插拔接口：`scripts/fetch_douyin_hot_api.py`

## 🔜 下一步前置流程（开发中）

目标流程：

1. 抓取抖音热榜第一
2. 自动生成标题与提示词
3. 自动生成剧本
4. 进入视频生产链路（画图 / Veo / 配音 / 真同步字幕 / 成片）

当前状态：
- 直接 HTTP 抓取抖音热榜公开页，第一版已落脚本，但因抖音反爬限制，当前不稳定。
- 第三方热榜源方案已接入并验证可用：当前默认源为 `https://v2.xxapi.cn/api/douyinhot`，脚本入口为 `scripts/fetch_douyin_hot_api.py`。
- 已新增下游前置脚本：`scripts/generate_hot_script.py`
- 该脚本现已验证可完成：**热榜第一 → 标题 → 镜头提示词 → 旁白 → 剧本文件落盘**。
- 已新增一键串联入口：`scripts/run_hot_pipeline.py`
- 该入口负责：**热榜第一 → 自动生成剧本 → 调用主出片脚本 → 返回最终成片路径**。
