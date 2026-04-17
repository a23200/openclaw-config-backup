# 核心项目启动备忘

更新时间：2026-04-17

## 1. PPT 项目
- 目录：`/Users/mac/Desktop/make-ppt`
- 启动命令：`node scripts/app-factory-preview.cjs`
- 访问地址：`http://127.0.0.1:4321`
- 备注：若 4321 端口已被占用且页面标题为 `Make PPT · Word to PPT Studio` 或 `Word to PPT Studio`，视为已启动。

## 2. App 项目
- 真实源码目录：`/Users/mac/Make app`
- 注意：`/Users/mac/Desktop/Make App` 目前更像运行壳/数据目录，不是主源码入口。
- 启动命令：`npm run dev -- --host 127.0.0.1 --port 4174`
- 访问地址：`http://127.0.0.1:4174`

## 3. 控制台 / Console 项目
- 目录：`/Users/mac/openclaw-console`
- 启动命令：`npm run dev -- --host 127.0.0.1 --port 3000`
- 访问地址：`http://127.0.0.1:3000`

## 4. 抖音爬虫
- 目录：`/Users/mac/Desktop/抖音爬虫`
- 启动命令：`./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
- 访问地址：`http://127.0.0.1:8000/`

## 5. 闲鱼项目
- 目录：`/Users/mac/.openclaw/workspace/xianyu-openclaw-channel`
- 重要：必须先切到该目录再启动，避免读错数据库。
- 启动命令：`./.venv312/bin/python Start.py`
- 前端地址：`http://127.0.0.1:18444/`
- 状态接口：`http://127.0.0.1:18444/api/bridge/status`

## 默认执行规则
当用户说“启动这些项目”“都要启动”“一次性全部启动”时：
1. 先检查目标端口是否已在监听。
2. 未启动则按上面的命令启动。
3. 启动后尽量自动打开前端页面。
4. `App` 项目优先使用 `/Users/mac/Make app`，不要误用 `/Users/mac/Desktop/Make App`。
