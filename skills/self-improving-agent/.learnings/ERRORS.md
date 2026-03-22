# 抖音自动化登录与报错记录

## [2026-03-19] SingletonLock File Exists 报错
**环境：** `douyin-creator-tools` 执行 `npm run works` 或 `npm run auth`
**报错描述：** `Failed to create a ProcessSingleton for your profile directory. File exists (17)`
**原因：** Playwright 的用户配置目录被残留的后台 Chrome 进程锁定，导致无法打开新窗口。
**解法：**
每次运行前，先执行清理命令杀掉僵尸进程并删除锁文件：
`rm -f ~/.agents/skills/douyin-creator-tools/.playwright/douyin-profile/SingletonLock`
`pkill -f "chromium|playwright" || true`
## [2026-03-19] Playwright Chromium SIGTRAP
**环境：** douyin-creator-tools npm run auth
**报错描述：** 测试版 Chromium 在启动时直接崩溃退回终端，并引发 SIGTRAP 错误。
**解法：** 放弃使用 npm run auth 唤起测试版浏览器，改用自带的 agent-browser 加载对应的本地配置目录（--profile ~/.agents/skills/douyin-creator-tools/.playwright/douyin-profile），以真实浏览器进行前置扫码授权。
