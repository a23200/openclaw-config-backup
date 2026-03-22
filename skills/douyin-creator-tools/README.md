# 抖音图文自动发布工具

这是一个使用 Node.js 和 Playwright 构建的自动化脚本，用于自动将图文内容发布到抖音创作者中心。

## ✨ 功能

- 自动上传单张或多张图片。
- 自动填写文案和 #话题 标签。
- 自动选择热门配乐。
- 自动点击发布按钮。

## 🚀 开始使用

### 1. 先决条件

- 已安装 [Node.js](https://nodejs.org/) (建议 v18 或更高版本)。
- 一个拥有创作者权限的抖音账号。

### 2. 安装

首先，将代码克隆到本地：
```bash
git clone https://github.com/a23200/douyin-images-txt.git
```

进入项目目录：
```bash
cd douyin-images-txt
```

安装项目所需的依赖库：
```bash
npm install
```

最后，安装 Playwright 所需的 Chromium 浏览器内核：
```bash
npx playwright install chromium
```

### 3. 首次登录授权 (一次性操作)

为了让脚本能够代表您进行操作，需要先进行一次扫码登录。

在项目根目录运行以下命令：
```bash
npm run auth
```

这会启动一个 Chrome 浏览器并打开抖音创作者中心的登录页面。请使用您的手机抖音 App **扫描二维码完成登录**。

登录成功后，您的登录状态会保存在项目下的 `.playwright/douyin-profile` 目录中，后续脚本会重复使用这个状态，无需再次登录。

> **注意:** 首次登录时请不要使用无头模式 (`--headless`)，需要看到并操作浏览器界面。

## 📖 操作指南：发布一篇图文

### 1. 准备发布内容

在项目的任意位置（推荐在 `src` 目录下）创建一个 `input.json` 文件，用于存放您想发布的图文信息。文件内容格式如下：

```json
{
  "imagePaths": ["/Users/mac/Desktop/image1.png"],
  "description": "这是我的第一篇自动发布的图文笔记！\n\n感觉太酷了！",
  "tags": ["AI自动化", "程序员", "抖音小技巧", "NodeJS"]
}
```

**字段说明:**

- `imagePaths`:  一个包含图片**绝对路径**的数组。目前脚本处理单张图片效果最好。
- `description`: 您想发布的图文主体内容。可以使用 `\n` 进行换行。
- `tags`: 话题标签数组。**不需要**自己加 `#` 号，程序会自动添加。抖音限制最多5个标签。

### 2. 执行发布命令

准备好 `input.json` 文件后，运行以下命令来启动自动发布流程：

```bash
node src/publish-imagetext.mjs /path/to/your/input.json
```

**请务必**将 `/path/to/your/input.json` 替换成您创建的 `input.json` 文件的实际路径。

脚本会自动打开浏览器，模拟人工操作，完成上传、填写、发布等一系列动作。

## 💡 注意事项

- 如果脚本运行提示未登录，或者卡在登录页面，说明您的登录状态可能已失效。请重新运行 `npm run auth` 命令再次扫码授权即可。
- 本工具旨在简化重复性工作，请遵守抖音社区规范，不要用于发布违规内容。
