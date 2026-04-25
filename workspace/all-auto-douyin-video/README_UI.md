# 即梦自动化工作流 UI

## 启动

```bash
cd /Users/mac/.openclaw/workspace/all-auto-douyin-video
python3 -m pip install -r requirements-ui.txt
uvicorn ui_app:app --host 127.0.0.1 --port 8788
```

打开：`http://127.0.0.1:8788`

## 当前能力

- 提交即梦视频任务
- 后台异步排队/生成（当前为占位异步框架）
- 展示任务状态
- 为后续接入真实即梦 CLI、下载成片、自动发抖音预留状态机

## 下一步

把 `simulate_jimeng_pipeline()` 换成真实的：
- 提交即梦任务
- 保存 `task_id`
- 后台轮询
- 完成后下载视频
- 继续接旁白/字幕/抖音发布
```