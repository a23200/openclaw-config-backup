# OpenClaw 商品搜索验证码状态说明

## 背景

本仓库已经接入 OpenClaw 的闲鱼商品搜索工具：

- `xianyu_search_products`
- `xianyu_get_spider_products`

实际联调后发现，商品搜索能力在当前闲鱼环境下会频繁触发阿里系搜索风控，主要表现为：

- `captchacapslidev2`
- `capscratch`
- `newslidecaptcha`
- 刮刮乐验证码

这意味着搜索功能不是稳定的无人工能力，而是一个可能被风控打断的能力。

## 本次做了什么

### 1. 搜索链路排查

已确认以下事实：

1. 搜索请求可以真实发出，不是伪调用。
2. 当前账号 `cookie_id` 可以正确注入浏览器环境。
3. 闲鱼搜索接口确实会返回验证码风控页面，而不是正常商品列表。
4. 问题核心不是“关键词没有结果”，而是“搜索触发风控”。

### 2. Python 运行环境修正

已确认当前项目原虚拟环境中的 `Python 3.14` 与本项目搜索链路中的 `Playwright` 组合存在稳定性问题。

为保证搜索和验证码调试可继续推进，新增了一个可工作的 `Python 3.12` 环境：

- `.venv312`

当前建议：

- 涉及商品搜索、验证码调试的流程优先使用 `.venv312`

### 3. Bridge API 返回兼容 OpenClaw

已对 `POST /api/bridge/spider/search` 和 `POST /api/bridge/spider/search-multi` 做兼容式扩展。

验证码场景下，接口不再仅返回失败或假装是普通空结果，而是：

1. 继续保留原有字段
   - `ok`
   - `keyword`
   - `total_results`
   - `new_records`
   - `new_record_ids`
2. 额外增加新字段
   - `captcha_required`
   - `error`
   - `captcha_info`

当前验证码场景返回示例：

```json
{
  "ok": true,
  "keyword": "iPhone 17",
  "total_results": 0,
  "new_records": 0,
  "new_record_ids": [],
  "captcha_required": true,
  "error": "需要人工完成刮刮乐验证码",
  "captcha_info": {
    "session_id": "3083424450",
    "control_url": "http://127.0.0.1:8080/api/captcha/control/3083424450",
    "base_control_url": "http://127.0.0.1:8080/api/captcha/control"
  }
}
```

这样做的目的是：

- 对 OpenClaw 的老调用方尽量兼容
- 同时让新调用方能准确识别“当前是验证码阻断，不是搜索成功但结果为 0”

### 4. OpenClaw 插件已适配验证码场景

已修改 `openclaw-plugin/index.ts`：

- 当接口返回 `captcha_required: true` 时
- 插件不再把它当成普通搜索失败
- 而是给出明确提示，告知用户：
  - 当前账号触发了闲鱼风控验证码
  - 当前会话 ID
  - 验证控制页地址

### 5. 新增主服务内验证码会话启动接口

新增接口：

- `POST /api/captcha/start-search-session`

用途：

- 由主服务进程自己启动一个真实搜索页面
- 进入验证码页面后创建远程控制会话
- 供浏览器控制页人工拖动使用

示例请求：

```bash
curl -X POST http://127.0.0.1:8080/api/captcha/start-search-session \
  -H "Content-Type: application/json" \
  -d '{"cookie_id":"3083424450","keyword":"iPhone 17"}'
```

示例返回：

```json
{
  "ok": true,
  "captcha_required": true,
  "session_id": "3083424450",
  "control_url": "http://127.0.0.1:8080/api/captcha/control/3083424450"
}
```

### 6. 验证码控制页可访问地址已修正

控制页地址已统一为本机可访问地址，避免错误的内网 IP：

- `http://127.0.0.1:8080/api/captcha/control/<session_id>`

### 7. 验证码控制页交互已增强

已对 `captcha_control.html` 做以下增强：

- 支持 `pointer` 事件
- 增加触摸/触控板兼容性
- 增加 WebSocket 自动重连
- 禁止默认拖拽和文本选择干扰
- 优化拖动轨迹转发逻辑

## 当前做到哪里了

当前已经做到：

1. OpenClaw 可以调用搜索接口。
2. OpenClaw 可以识别当前是否被验证码阻断。
3. 验证码阻断时，能拿到明确的控制地址和会话信息。
4. 主服务内可以主动创建一个验证码会话用于人工处理。
5. 整体响应格式已尽量兼容现有 OpenClaw 插件。

## 当前已知问题

### 1. 核心限制不是代码，而是闲鱼风控本身

当前最大的限制是：

- 即使人工拖动验证码，也不一定能通过
- 在闲鱼真实页面里人工多次尝试，也可能依然不过

这说明当前问题不只是前端拖动是否流畅，还涉及：

- 账号风险状态
- 浏览器环境指纹
- 服务端行为校验
- 验证码服务端判定策略

因此，不能把这条商品搜索能力视为稳定可依赖能力。

### 2. 验证码控制页仍有明显延迟

当前虽然已经能拖动，但体验上仍可能出现：

- 拖动有明显延迟
- 松手后画面还在继续动

这说明远程控制链路仍有性能优化空间。

### 3. 自动解码路线已验证不可行

本次已尝试接入第三方验证码平台进行实验：

- YesCaptcha
- CaptchaRun 文档评估

结论：

- 当前闲鱼 `capscratch/newslidecaptcha` 并不适合直接用标准验证码平台解决
- YesCaptcha 对当前问题类型返回不支持
- OCR 结果也不足以完成刮刮乐验证

因此，自动解码路线当前建议停止投入。

## 对 OpenClaw 的兼容建议

在 OpenClaw 侧，建议按下面逻辑处理搜索结果：

1. 若 `captcha_required !== true`
   - 按普通搜索成功结果处理
2. 若 `captcha_required === true`
   - 不要把它当成“空结果”
   - 不要把它当成“普通接口错误”
   - 应明确提示用户当前被闲鱼验证码阻断
   - 若需要人工处理，可展示 `captcha_info.control_url`

推荐识别字段：

```json
{
  "captcha_required": true,
  "captcha_info": {
    "session_id": "3083424450",
    "control_url": "http://127.0.0.1:8080/api/captcha/control/3083424450"
  }
}
```

## 建议后续改进

### 1. 优先做性能优化

验证码控制页若还要继续使用，建议后续优先优化：

- 拖动过程不要高频刷新截图
- WebSocket 消息节流
- 鼠标轨迹插值减少
- 只在关键节点刷新画面

### 2. 明确产品降级策略

建议在 OpenClaw 产品层明确告诉用户：

- 商品搜索可能受闲鱼风控限制
- 当触发验证码时，需要人工处理
- 人工处理后也不保证一定通过

### 3. 搜索功能建议视为“有限可用”

目前更合理的产品定义是：

- 该能力可以尝试执行
- 但不应承诺稳定结果
- 一旦触发风控，应提示用户改为人工处理或稍后重试

### 4. 后续测试建议

后续测试建议按下面顺序进行：

1. 用 `.venv312` 启动服务
2. 调用 `POST /api/bridge/spider/search`
3. 验证返回是否带 `captcha_required`
4. 调用 `POST /api/captcha/start-search-session`
5. 打开 `captcha_info.control_url`
6. 手动拖动验证码
7. 观察是否通过，以及通过率是否有改善

### 5. 浏览器环境问题仍需单独评估

已验证：

- 默认自动化测试浏览器更容易触发闲鱼风控
- 使用真实本地浏览器手动访问闲鱼搜索页时，可能可以正常看到结果

但这条“复用真实浏览器环境”的工程接入方案目前尚未稳定落地，暂不作为默认能力写入生产链路。

因此当前文档结论仍然保持：

- 搜索接口可用
- 验证码状态返回可用
- 但搜索能力本身仍受闲鱼风控强影响

## 当前建议结论

当前阶段建议：

1. 保留商品搜索能力
2. 明确标注它可能受验证码风控影响
3. 将 `captcha_required` 作为正式兼容字段保留下来
4. 暂停继续投入自动解码平台接入
5. 后续只在必要时再继续优化验证码远程控制性能
