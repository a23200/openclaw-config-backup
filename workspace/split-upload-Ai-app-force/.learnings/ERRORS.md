## [ERR-20260418-001] npm_install_dependency_resolution

**Logged**: 2026-04-18T01:56:30+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
`npm install` 因 `openai` 与 `zod` 的 peer dependency 版本不兼容而失败

### Error
```
npm error Could not resolve dependency:
npm error peerOptional zod@"^3.23.8" from openai@5.23.2
```

### Context
- Command: `npm install`
- Current setup used `zod@^4.1.11`
- `openai@5.x` 在当前解析结果下要求可选 peer 为 `zod@^3.23.8`

### Suggested Fix
将根依赖中的 `zod` 调整为 3.x 兼容版本，再重新安装依赖。

### Metadata
- Reproducible: yes
- Related Files: `package.json`

---

## [ERR-20260418-002] express5_spa_fallback_route

**Logged**: 2026-04-18T02:03:15+08:00
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Express 5 下使用 `app.get("*")` 作为 SPA 回退路由时触发 `path-to-regexp` 路径解析错误

### Error
```
PathError [TypeError]: Missing parameter name at index 1: *
```

### Context
- Command: `npm run dev`
- Environment: Express 5 + path-to-regexp
- 生产静态托管逻辑在 `server/index.ts`

### Suggested Fix
改用更稳妥的 `app.use(...)` 条件回退，只在非 API、非 APK 的 GET 请求上返回 `dist/client/index.html`。

### Metadata
- Reproducible: yes
- Related Files: `server/index.ts`

---
