# Make App

一个面向正式运营场景的 Android App 生成网站：

- 输入产品需求，自动提炼核心模块
- 生成多屏手机 App 预览
- 自动附带一个本地可用功能模块
- 网站按钮直接下载正式版 Android APK

## 启动

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4174
```

## 构建前端

```bash
npm run build
```

## 直接生成正式版 APK

```bash
npm run build:apk
```

生成后的正式版 APK 默认会输出到：

```bash
./灵动商城-android-release.apk
```

网站动态生成的 APK 会输出到：

```bash
./public/downloads/generated/
```

## 当前能力

- 网站会根据当前输入动态生成 App 结构与本地功能模块
- 生成的 Android 安装包为 `release APK`
- APK 已带正式签名，可直接安装到安卓手机
- App 自带纯本地功能，例如搜索、收藏、待办、预约、记账等
- 如需联网能力，可在当前基础上继续接入正式接口
