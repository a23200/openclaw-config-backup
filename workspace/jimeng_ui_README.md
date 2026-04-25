# 即梦工作流 UI

## 启动

```bash
cd /Users/mac/.openclaw/workspace
python3 -m venv .jimeng-ui-venv
source .jimeng-ui-venv/bin/activate
pip install -r jimeng_ui_requirements.txt
uvicorn jimeng_ui_app:app --host 127.0.0.1 --port 8790
```

打开：`http://127.0.0.1:8790`

## 说明
- 这是基于真实 `dreamina` CLI 的异步任务 UI
- 提交后会依次跑：首帧 -> 尾帧 -> 视频 -> query_result 轮询下载
- 下载结果放在：`/Users/mac/.openclaw/workspace/jimeng_runs/<job_id>/`
