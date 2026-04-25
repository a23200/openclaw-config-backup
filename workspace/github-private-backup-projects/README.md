# Project Backup Private

这个私有仓库用于集中备份当前主力项目的安全版本。

## 当前包含项目

- `openclaw-console`
  - 实际目录：`/Users/mac/openclaw-console`
- `make-ppt`
  - 实际目录：`/Users/mac/Desktop/make-ppt`
- `Ai-app`
  - 实际目录：`/Users/mac/Desktop/Ai-app`
- `douyin-crawler`
  - 实际目录：`/Users/mac/Desktop/抖音爬虫`
- `xianyu-openclaw-channel`
  - 实际目录：`/Users/mac/.openclaw/workspace/xianyu-openclaw-channel`
- `jimeng-ui`
  - 实际目录：`/Users/mac/Desktop/项目总表/jimeng-ui`
- `PlotPilot`
  - 实际目录：`/Users/mac/Desktop/PlotPilot`

## 备份规则

这是“安全覆盖”备份，不是原机器的完整镜像。

默认排除：
- `.env` / `.env.*`
- `node_modules/`
- `venv/` / `.venv/`
- `dist/` / `build/` / `.next/`
- `*.db`
- `browser_data/`
- `.playwright/`
- `debug-runs/`
- `*.log` / `*.pid` / `*.sock`
- 其他常见运行时缓存与临时文件

## 说明

- 本仓库面向 GitHub 私有备份，不保存敏感凭据。
- 若需完整迁移（包括密钥与本地运行环境），应使用离线备份方案，而不是直接依赖此仓库。
