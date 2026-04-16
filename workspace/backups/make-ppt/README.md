# make-ppt

独立的本地 PPT 生成项目目录。

这个目录只保留了 PPT 相关能力：

- `scripts/app-factory-preview.cjs`：本地 `Word/PDF/Markdown -> PPT` 网页入口
- `scripts/build_*.py`：几套图片型 PPT / 单页样张生成脚本
- `src/app-factory/`：前端页面
- `runtime/`：本地生成结果
- `归档/`：历史图片、样张、参考图归档
- `.venv/`：本地 Python 运行环境

常用命令：

- `node scripts/app-factory-preview.cjs`
- `./.venv/bin/python scripts/build_clawlink_image_ppt_demo.py`
- `./.venv/bin/python scripts/build_core_competitiveness_field_demo.py`
- `./.venv/bin/python scripts/build_core_competitiveness_gemini_style_demo.py`
- `./.venv/bin/python scripts/build_neural_params_controlled_demo.py`
- `./.venv/bin/python scripts/build_neural_params_gemini_ref_demo.py`
