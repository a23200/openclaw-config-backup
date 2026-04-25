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

## [ERR-20260421-001] android_generator_uistate_success_star_projection

**Logged**: 2026-04-21T00:00:00+08:00
**Priority**: high
**Status**: fixed
**Area**: backend

### Summary
Generated Kotlin projects failed after `is UiState.Success` was repaired to `is UiState.Success<*>` without preserving the concrete `data` type.

### Error
```text
One type argument expected. Use 'Success<*>' if you don't want to pass type arguments
Unresolved reference: service / people / selectedAddress / contactName / totalAmount
Type mismatch: inferred type is Any? but ... was expected
```

### Context
- Precompile repair changed generic `UiState.Success` checks to star projections.
- Kotlin then treated `state.data` as `Any?` inside branches.
- Nested branches could also shadow an outer `data` variable when auto-casting list states.

### Suggested Fix
Maintain a project-wide `UiState` property type index, cast `state.data` back to the concrete type inside `Success<*>` branches, avoid `data` name shadowing, and add imports required by inserted casts.

### Metadata
- Reproducible: yes
- Related Files: server/services/androidBuilder.ts
- Tags: android, kotlin, compose, codegen, uistate

---

## [ERR-20260421-002] android_generator_partial_fix_verification_gap

**Logged**: 2026-04-21T01:59:00+08:00
**Priority**: high
**Status**: fixed
**Area**: backend / workflow

### Summary
之前把单个 Kotlin 编译错误当成“已修复”，但没有用同一失败项目重新走完整生成器链路验证，导致用户换项目后继续遇到同类编译失败。

### Error
```text
用户反馈：我又换了项目，又有错误。你到底改了什么？
真实根因：局部修复 `UiState.Success` 泛型参数后，没有保护 `state.data` 的具体类型，造成 `Any?` 类型擦除和级联字段访问错误。
```

### Context
- 修复不能只看首个 Kotlin error 消失；必须看完整 `build.log` 是否到 `BUILD SUCCESSFUL`。
- 临时项目手工能过不代表生成器已防复发；必须把规则补进 `server/services/androidBuilder.ts` 的预编译修复链路。
- 重启后端并用 `skipCodegen=1` 重跑失败项目，才能确认应用自己的构建接口也使用了新逻辑。

### Suggested Fix
以后每次处理 Android 生成器编译失败，都必须执行“复现日志 → 根因归类 → 生成器预修复 → `npm run lint` → `npm run build` → 重启后端 → 同项目接口重编译 → 确认 APK 生成”的闭环。

### Metadata
- Reproducible: yes
- Related Files: `server/services/androidBuilder.ts`, `.learnings/LEARNINGS.md`
- Tags: android-build, verification, user-feedback, prevention

---
