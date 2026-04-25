# make-ppt

独立的本地 PPT 生成项目目录。

这个目录只保留了 PPT 相关能力：

- `scripts/app-factory-preview.cjs`：本地 `Word/PDF/Markdown -> PPT` 网页入口
- `scripts/build_comic_manga_ppt.py`：漫画风 PPT 专用真生图脚本，支持 Gemini / GPT Image 两条路线
- `scripts/build_*.py`：几套图片型 PPT / 单页样张生成脚本
- `src/app-factory/`：前端页面
- `docs/comic-ppt-workflow.md`：漫画风模板 SOP / 记忆
- `runtime/`：本地生成结果
- `归档/`：历史图片、样张、参考图归档
- `.venv/`：本地 Python 运行环境

常用命令：

- `node scripts/app-factory-preview.cjs`
- `./.venv/bin/python scripts/build_comic_manga_ppt.py --source /path/to/source.md --native-text`
- `./.venv/bin/python scripts/build_comic_manga_ppt.py --source /path/to/source.md --native-text --image-provider gpt`
- `./.venv/bin/python scripts/build_clawlink_image_ppt_demo.py`
- `./.venv/bin/python scripts/build_clawlink_image_ppt_demo.py --use-gemini`（自动读取 `归档` 里的样图/参考图，需有效 Gemini Key）
- `./.venv/bin/python scripts/build_core_competitiveness_field_demo.py`
- `./.venv/bin/python scripts/build_core_competitiveness_gemini_style_demo.py`
- `./.venv/bin/python scripts/build_neural_params_controlled_demo.py`
- `./.venv/bin/python scripts/build_neural_params_gemini_ref_demo.py`

网站新增模板：

- `漫画风 PPT`：上传文档后走 `v7 融合规则 + Gemini 真生图 + 图文融合 + 动态页数 + 实时进度` 专用流程
- `漫画风 PPT（GPT）`：上传文档后走 `v7 融合规则 + GPT Image 真生图 + 图文融合 + 动态页数 + 实时进度` 专用流程
