# 老弟(Laodi) MCP Server - 小智AI音乐控制版

将本MCP服务接入小智AI语音终端，通过语音命令控制LX Music播放器。

---

## 📋 简介

本项目是老弟(Laodi)的MCP工具集，专门用于通过小智AI语音控制LX Music音乐播放器。

**功能特性：**
- 🎵 播放/暂停音乐
- ⏭️ 上一首/下一首
- 🔍 搜索音乐
- 🌐 打开浏览器、查询天气等基础功能

---

## 🚀 快速开始

### 1. 安装依赖

```bash
cd xiaozhi-mcp-lxmusic
pip3 install --break-system-packages fastmcp websockets
```

### 2. 设置Token

将小智控制台获取的MCP Token设置到环境变量：

```bash
export MCP_ENDPOINT="wss://api.xiaozhi.me/mcp/?token=你的token"
```

### 3. 启动服务

```bash
chmod +x run.sh
./run.sh
```

---

## 🎤 语音命令对照表

| 你对小智说 | 调用的工具 | 功能 |
|-----------|-----------|------|
| "老弟，打开音乐" | `open_music_player` | 打开LX Music |
| "老弟，播放" | `music_play_pause` | 播放/暂停 |
| "老弟，暂停" | `music_play_pause` | 播放/暂停 |
| "老弟，下一首" | `music_next` | 下一首 |
| "老弟，切歌" | `music_next` | 下一首 |
| "老弟，上一首" | `music_prev` | 上一首 |
| "老弟，搜索音乐 xxx" | `music_search` | 搜索音乐 |

---

## 📁 文件说明

```
xiaozhi-mcp-lxmusic/
├── server.py          # MCP服务核心代码
├── mcp_pipe.py       # WebSocket桥接器
├── run.sh            # 一键启动脚本
├── requirements.txt   # Python依赖
├── README.md         # 本说明文档
└── music-tools.md    # 音乐工具提示词
```

---

## 🔧 音乐控制实现原理

由于LX Music没有暴露AppleScript接口，采用以下方式控制：

### 播放/暂停
1. 激活LX Music窗口
2. 发送空格键 keystroke " "

### 上一首/下一首
1. 激活LX Music窗口
2. 发送 Ctrl+方向键
   - 下一首：`key code 124` (右箭头) + Control
   - 上一首：`key code 123` (左箭头) + Control

### 搜索音乐
1. 激活LX Music窗口
2. Cmd+F 打开搜索框
3. 输入搜索关键词
4. 回车搜索

---

## ⚠️ 注意事项

1. **LX Music需要在Applications目录**：应用名为 `lx-music-desktop`
2. **首次使用需要授权**：macOS可能需要授权辅助功能权限
3. **Token有效期**：小智的token可能会过期，过期后需要重新获取

### 授权辅助功能

如果遇到权限问题，在终端运行：
```bash
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
```

然后将 Terminal 添加到辅助功能列表。

---

## 🔄 常见问题

### Q: 调用失败怎么办？
A: 检查LX Music是否正在运行，窗口是否正常显示。

### Q: 快捷键不生效？
A: 需要在系统偏好设置中授权辅助功能权限。

### Q: 如何停止服务？
A: 在终端按 Ctrl+C 或关闭终端窗口。

---

## 📝 小智系统提示词

将以下内容添加到小智AI的系统提示词中：

```markdown
### 音乐控制 (LX Music)

当用户说以下话时，请调用相应工具：

| 用户说的话 | 调用的工具 | 说明 |
|-----------|-----------|------|
| "打开音乐" / "播放音乐" | `open_music_player` | 打开LX Music播放器 |
| "播放" / "暂停" | `music_play_pause` | 播放/暂停当前音乐 |
| "下一首" / "切歌" | `music_next` | 切换到下一首 |
| "上一首" | `music_prev` | 切换到上一首 |
| "搜索音乐 xxx" | `music_search` | 搜索音乐 |
```

---

## 🔗 相关链接

- [LX Music 官网](https://lxmusic.toside.cn/)
- [小智AI](https://xiaozhi.me/)
- [MCP协议文档](https://modelcontextprotocol.io/)

---

*版本: 1.0 | 更新日期: 2026-03-01*
