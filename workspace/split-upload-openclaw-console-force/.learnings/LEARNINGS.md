## [LRN-20260413-001] correction

**Logged**: 2026-04-13T00:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
3D 视角切换动画不能持续抢占用户的手动旋转控制

### Details
把相机过渡直接放进每帧更新后，虽然视角切换更平滑了，但会持续把 OrbitControls 的 target 和 camera 拉回预设点，导致用户手动旋转时出现“发黏、发卡、不跟手”的体验回归。

### Suggested Action
仅在预设切换时启用相机过渡；一旦用户开始拖拽或过渡收敛，就停止自动插值，把控制权完整交还 OrbitControls。

### Metadata
- Source: user_feedback
- Related Files: src/components/ClawLinkOffice3D.jsx
- Tags: 3d, camera, orbitcontrols, regression

---
## [LRN-20260415-001] correction

**Logged**: 2026-04-14T17:27:34Z
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
wrong_directory_plotpilot

### Details
用户要求部署 PlotPilot 时，我默认在当前工作目录 `/Users/mac/openclaw-console` 下拉取并安装，未先确认这是不是用户希望的目标目录。正确做法是先确认或推断合适的目标路径，再开始 clone 和安装。

### Suggested Action
后续涉及 clone、部署、安装依赖时，先确认当前目录是否就是目标目录；若用户指出目录错误，优先清理误建内容和残留进程。

### Metadata
- Source: user_feedback
- Related Files: /Users/mac/openclaw-console/.learnings/LEARNINGS.md
- Tags: correction, directory, deployment

---
