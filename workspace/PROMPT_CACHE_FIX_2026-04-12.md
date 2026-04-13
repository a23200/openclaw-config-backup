# Prompt Cache 修复记录（2026-04-12）

## 现象
- 后台观察到 Prompt Cache 长时间 `0% hit`
- Token 消耗明显偏高
- 修改配置后曾出现：
  - `Config invalid`
  - `models.providers.codexzh.models.0.compat: Unrecognized key: "supportsPromptCache"`

## 排查结论
当前环境：
- OpenClaw: `2026.4.8 (9ece252)`
- 主模型：`codexzh/gpt-5.4`
- Provider Base URL: `https://api.codexzh.com/v1`

### 根因 1：provider API 类型不对
原本 `~/.openclaw/openclaw.json` 中 `codexzh` 配的是：
- `api: "openai-completions"`

但 Prompt Cache 相关 FAQ 指向的是 `openai-responses` 链路，因此先改为：
- `api: "openai-responses"`

### 根因 2：当前 OpenClaw 版本会对代理端点剥离 prompt cache 字段
在当前安装版本的 dist 中确认到：
- 文件：`/opt/homebrew/lib/node_modules/openclaw/dist/provider-attribution-C_pj06zc.js:321`
- 原逻辑：

```js
shouldStripResponsesPromptCache: api !== void 0 && OPENAI_RESPONSES_APIS.has(api) && policy.usesExplicitProxyLikeEndpoint,
```

这意味着：
- 只要是代理 `baseUrl`
- 即便模型理论上支持 Prompt Cache
- 仍会把 `prompt_cache_key` / `prompt_cache_retention` 从请求里剥掉

### 根因 3：配置 schema 不支持 `supportsPromptCache`
虽然 FAQ 提到可以在配置里加：

```json
"compat": { "supportsPromptCache": true }
```

但本机这版 `openclaw.json` schema 会直接报错：

```text
models.providers.codexzh.models.0.compat: Unrecognized key: "supportsPromptCache"
```

所以：
- **不能把 `supportsPromptCache` 留在 `openclaw.json` 中**
- 否则 gateway 会因配置非法而中止

## 最终采用的修复

### 1. 修正配置 API 类型
文件：`~/.openclaw/openclaw.json`

将 `codexzh` provider 改为：

```json
"codexzh": {
  "api": "openai-responses",
  "apiKey": "***",
  "baseUrl": "https://api.codexzh.com/v1",
  "models": [
    {
      "id": "gpt-5.4",
      "input": ["text", "image"],
      "name": "gpt-5.4"
    }
  ]
}
```

注意：
- 不要在这里加入 `supportsPromptCache`
- 当前版本 schema 不认

### 2. 对 OpenClaw dist 打最小补丁
文件：
- `/opt/homebrew/lib/node_modules/openclaw/dist/provider-attribution-C_pj06zc.js`

备份文件：
- `/opt/homebrew/lib/node_modules/openclaw/dist/provider-attribution-C_pj06zc.js.bak-prompt-cache-20260412-210330`

补丁内容：

```js
shouldStripResponsesPromptCache: input.compat?.supportsPromptCache === true ? false : api !== void 0 && OPENAI_RESPONSES_APIS.has(api) && policy.usesExplicitProxyLikeEndpoint,
```

> 说明：
> 当前本地最终生效并不是依赖 `openclaw.json` 里的 `compat` 字段，
> 而是利用运行期模型对象上的 `compat` 信息/兼容补丁链路绕过 strip。
> 这属于当前版本的临时修复方案。

### 3. 重载 gateway
使用 gateway restart 让补丁生效。

## 修复结果
修复后通过 `session_status` 观察到：
- `Cache: 2% hit`
- `2.6k cached`

说明：
- Prompt Cache 已经不再是完全 0
- 修复有效
- 只是当前命中率还偏低，属于后续优化问题，不再是“完全不生效”问题

## 当前稳定状态
- `~/.openclaw/openclaw.json` 保持合法
- `codexzh` 使用 `openai-responses`
- Prompt Cache 的关键绕过逻辑在 dist 补丁里

## 后续注意事项
### 升级 OpenClaw 后重点检查
升级 OpenClaw 后，以下文件可能被覆盖：
- `/opt/homebrew/lib/node_modules/openclaw/dist/provider-attribution-C_pj06zc.js`

如果升级后又出现：
- cache 再次长期 0%
- 或代理端点 снова strip prompt cache

优先检查这处补丁是否丢失。

### 回滚方法
如需回滚 dist 补丁，可恢复备份：

```bash
cp /opt/homebrew/lib/node_modules/openclaw/dist/provider-attribution-C_pj06zc.js.bak-prompt-cache-20260412-210330 \
   /opt/homebrew/lib/node_modules/openclaw/dist/provider-attribution-C_pj06zc.js
```

然后重载 gateway。

## 一句话总结
这次不是单纯“配个 `supportsPromptCache` 就行”，而是：
- 配置层要切到 `openai-responses`
- 当前 OpenClaw 版本对代理端点仍会 strip prompt cache
- 还因为 schema 不认 `supportsPromptCache`，所以最终只能靠 **dist 最小补丁** 真正打通
