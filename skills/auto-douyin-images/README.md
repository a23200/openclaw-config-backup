# 🤖 auto-douyin-images (全自动抖音图文营业员)

这是一个为 **OpenClaw (或类似 Agent 框架)** 打造的全自动图文发布技能。
能够让你的 AI 助手自主实现“随机抓图”、“生成合规幽默文案”、“自动排版”并“一键发布”到抖音。

## 🛡️ 隐私与安全承诺
本仓库**不包含**任何用户的个人隐私数据、抖音 Cookie、手机号等敏感信息。发布核心依赖于本地配置好环境变量的底层工具，代码本身仅包含自动化提示词(Prompt)和工作流架构。

## 📦 依赖前提 (Prerequisites)
1. 你的机器上已经安装并运行了 [OpenClaw](https://github.com/openclaw/openclaw)。
2. 你的机器上已经安装并配置好了底层的抖音发布工具：`douyin-creator-tools`。
3. 抖音账号已在本地浏览器上下文中完成登录授权。

## 🚀 部署教程 (Installation)
你可以将此技能文件夹直接克隆到你的本地 Skills 目录中：

```bash
# 1. 进入你的 Agent 技能目录 (以 OpenClaw 为例)
cd ~/.agents/skills/

# 2. 克隆本仓库
git clone https://github.com/a23200/auto-douyin-images.git

# 3. 检查技能是否被识别
# 重启 Agent，或直接对它说“查看你有哪些技能”。
```

## 🎯 怎么使用 (Usage)
一旦安装完毕，只需要在聊天窗口对你的 AI 小助手发送：
> “老弟，随机给我发个图文抖音！”
> “今天该营业了，自动发个图文！”

AI 就会静默在后台：
1. 从 `picsum.photos` 抓取一张安全的高清配图。
2. 以“赛博打工人”的口吻生成一段幽默且符合抖音审核规范的正能量文案。
3. 组装数据并调用 `douyin-creator-tools` 全自动完成图文发布。
4. (可选) 配置 cron job 让它每天定时营业！
