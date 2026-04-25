# 视频工作流项目

这是从现有工作流中整理出的独立 UI 项目目录，供后续用开发工具继续开发。

## 当前目标
- 视频工作流任务 UI
- 异步任务状态管理
- 后处理策略层（自动判断 / 纯画面 / 点题字幕 / 解说模式）
- 抖音发布链路预留/接入

## 当前核心文件
- `ui/jimeng_ui_app.py`：FastAPI 后端（任务编排 / 状态机 / 产物下载）
- `ui/static/index.html`、`style.css`、`app.js`：高级感深色电影级前端
- `docs/UI_FUNCTIONS.md`：UI 应具备的功能清单
- `docs/WORKFLOW.md`：工作流与状态机说明
- `docs/TODO.md`：后续开发待办

## 启动
```bash
pip install -r ui/jimeng_ui_requirements.txt
# AI 助手：默认已接入 codexzh 中转 API（gpt-5.4）
# 如需覆盖可在环境变量里改：
# export OPENAI_BASE_URL=https://api.codexzh.com/v1
# export OPENAI_API_KEY=sk-xxx
# export OPENAI_MODEL=gpt-5.4
uvicorn ui.jimeng_ui_app:app --reload --port 8000
# 浏览器打开 http://127.0.0.1:8000
```
当模型接口不可用或返回格式异常时，`/api/generate` 会自动走模板兜底，不会中断流程。

## 当前旁白链路
- 解说模式优先使用 OpenAI 兼容 TTS 接口生成更真实的旁白
- 默认读取环境变量：`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_TTS_MODEL`
- 默认 `OPENAI_BASE_URL` 回退到 `https://api.codexzh.com/v1`
- 在线 TTS 失败时，会自动回退到旧 `gTTS` 或系统 `say`

## AI 助手 · 热榜抽题
前端「⓪ AI 助手」区块支持：
- 手动输入题目 → ✨ 生成提示词（首/尾/视频/点题/抖音标题/描述）
- 🔥 抖音热榜 抽屉（聚合多来源，10 分钟缓存）
- 🎲 随机抽题：直接从热榜抽一个并自动生成
- 生成后自动填入表单并联动选择建议的后处理模式

## API 一览
- `GET  /api/meta` — 状态机定义
- `GET  /api/jobs` — 任务列表
- `POST /api/jobs` — 创建任务
- `GET  /api/jobs/{id}` — 任务详情（含产物清单）
- `POST /api/jobs/{id}/retry` — 重试 / 续跑
- `DELETE /api/jobs/{id}` — 删除任务与产物
- `GET  /api/jobs/{id}/files` — 列出产物文件
- `GET  /api/jobs/{id}/files/{name}` — 下载产物
- `GET  /api/jobs/{id}/preview/{name}` — 内联预览（图/视频）
- `GET  /api/hot` — 抖音热榜聚合（带 10 min 缓存）
- `GET  /api/hot/random` — 随机返回一条热榜
- `POST /api/generate` — 给定 `topic`，返回整套提示词（OpenAI 兼容中转 · gpt-5.4 · JSON 模式；失败时模板兜底）

## 说明
当前目录是"开发整理版"，不是最终生产前端工程。
如果你要继续做 React/Vue/Next 前端，可以直接把这里当产品/后端原型参考。
