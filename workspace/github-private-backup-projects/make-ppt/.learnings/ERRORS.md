## [ERR-20260421-001] gemini_image_generation_timeout

**Logged**: 2026-04-21T15:40:27Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Gemini 图片生成链路在最小冒烟测试中 90 秒超时，HTTP/2 已切换到 HTTP/1.1 后仍未拿到图片结果。

### Error
```
RuntimeError: Gemini image request timed out after 90 seconds.
subprocess.TimeoutExpired: Command '['curl', '-sS', '--http1.1', '-X', 'POST', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent', ...]' timed out after 90 seconds
```

### Context
- Operation attempted: `build_comic_manga_ppt.generate_gemini_image()` 最小图片冒烟测试
- Input: 1 页 `SlidePage`，保留漫画模板默认参考图逻辑
- Environment: 本地 `.env` 可提供 Gemini API key；HTTP/2 framing 错误已通过 `--http1.1` 规避

### Suggested Fix
增加连接/低速超时并区分“模型处理过慢”与“网络层挂起”；同时验证无参考图、较小 payload 是否能正常返回。

### Metadata
- Reproducible: yes
- Related Files: scripts/build_comic_manga_ppt.py

---
## [ERR-20260422-001] gpt-image-openai-compatible

**Logged**: 2026-04-22T00:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
OpenAI-compatible GPT image route failed while generating PPT images because the upstream service returned an expired account token error.

### Error
```
发起对话失败: 当前账号 AT 过期，请点击右侧重试按钮
```

### Context
- Command/operation attempted: `scripts/build_comic_manga_ppt.py --native-text --image-provider gpt --page-reference-dir ...`
- Input: old fusion layout reference pages under `runtime/manual-watch/20260422-旧神陨落新神开眼-修复提炼-正式生成/comic-assets`
- Environment: local `.env` contains `COMIC_GPT_IMAGE_API_KEY`, `COMIC_GPT_IMAGE_BASE_URL`, and `COMIC_GPT_IMAGE_MODEL`

### Suggested Fix
Replace or refresh the upstream GPT image account credential, then rerun the PPT generation command.

### Metadata
- Reproducible: yes
- Related Files: scripts/build_comic_manga_ppt.py

---
