# 霸霸精准流量获取工具

一个可运行的霸霸精准流量获取工具，覆盖：

- 目标视频登记
- 评论导入入库
- 评论意向打分
- 线索池聚合
- 外呼任务台账
- 汇总报表

## 快速开始

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
```

或者直接用脚本：

```bash
zsh /Users/mac/Desktop/抖音爬虫/scripts/start_server.sh
zsh /Users/mac/Desktop/抖音爬虫/scripts/stop_server.sh
```

服务启动后可访问：

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/api/health`

## 主要接口

- `POST /api/videos`
- `GET /api/videos`
- `POST /api/comments/import`
- `POST /api/douyin/collect/comments`
- `GET /api/leads`
- `POST /api/leads/{lead_id}/status`
- `POST /api/outreach/tasks`
- `POST /api/outreach/tasks/{task_id}/status`
- `GET /api/reports/summary`

## 导入样例

- JSON 样例：`/Users/mac/Desktop/抖音爬虫/examples/comments_import.json`
- CSV 样例：`/Users/mac/Desktop/抖音爬虫/examples/comments_import.csv`
- 导入脚本：`/Users/mac/Desktop/抖音爬虫/scripts/import_comments.py`

先创建视频：

```bash
curl -X POST http://127.0.0.1:8000/api/videos \
  -H 'Content-Type: application/json' \
  -d '{
    "platform_video_id": "7490050011223344556",
    "video_url": "https://www.douyin.com/video/7490050011223344556",
    "title": "创业副业案例视频"
  }'
```

再导入 JSON 评论：

```bash
source .venv/bin/activate
python /Users/mac/Desktop/抖音爬虫/scripts/import_comments.py \
  --file /Users/mac/Desktop/抖音爬虫/examples/comments_import.json
```

如果是 CSV：

```bash
source .venv/bin/activate
python /Users/mac/Desktop/抖音爬虫/scripts/import_comments.py \
  --video-id 1 \
  --file /Users/mac/Desktop/抖音爬虫/examples/comments_import.csv
```

导入后可直接查看：

```bash
curl http://127.0.0.1:8000/api/leads
curl http://127.0.0.1:8000/api/reports/summary
```

## 数据流

1. 创建目标视频
2. 批量导入评论
3. 系统按规则自动打分并聚合线索
4. 查询高意向线索池
5. 创建外呼任务并追踪状态

## 管理台

- 浏览器打开 `http://127.0.0.1:8000/`
- 页面内支持创建视频、实时抓取霸霸评论、填充样例评论、筛选线索、打开用户主页、创建外呼任务、更新任务状态
- Swagger 仍保留在 `http://127.0.0.1:8000/docs`

## 当前实现说明

- 数据库默认使用本地 `SQLite`
- 评论导入接口支持幂等更新
- 霸霸实时采集通过本机 `agent-browser` + 浏览器登录态工作；若命中验证码页，会返回明确错误
- 打分规则内置在 `app/services/lead_scoring.py`
- 外呼任务仅做任务台账与状态流转，不接入任何平台发送器
- Swagger UI 会直接展示请求样例：`http://127.0.0.1:8000/docs`
