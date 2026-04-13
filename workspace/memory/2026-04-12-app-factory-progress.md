# App Factory Progress Memory

Updated: 2026-04-12 20:52 Asia/Shanghai

## What was built

- Implemented a new MVP website for `Word -> PPT` generation in `openclaw-control-center/src/app-factory/index.html`.
- Added a local preview/backend server in `openclaw-control-center/scripts/app-factory-preview.cjs`.
- Added a minimal SVG page generator in `openclaw-control-center/scripts/generate-mvp-svg.cjs`.
- Added `npm run dev:app-factory` to `openclaw-control-center/package.json`.
- Cloned `ppt-master` into `~/.openclaw/workspace/ppt-master`.

## Current pipeline status

The website now really runs this flow:

1. Create local project record and folders
2. Create a real `ppt-master` project
3. Import source file into the `ppt-master` project
4. Auto-write `design_spec.md`
5. Copy selected template assets from `ppt-master`
6. Generate 4 MVP SVG pages into `svg_final/`
7. Export editable PPTX and `_svg.pptx` via `ppt-master`

## Important implementation notes

- `ppt-master` full `requirements.txt` install failed in `.venv` because `pycairo`/`cairo` toolchain was missing.
- Minimal export dependencies were installed successfully in `ppt-master/.venv`:
  - `python-pptx`
  - `lxml`
  - `Pillow`
  - `XlsxWriter`
- Backend was updated to use `ppt-master/.venv/bin/python` instead of system `python3`.
- This solved the previous `ModuleNotFoundError: No module named 'pptx'` export failure.

## Important caveat

- Current SVG generation is **MVP-only**.
- It generates 4 fixed pages:
  - `01_cover.svg`
  - `02_toc.svg`
  - `03_content.svg`
  - `04_ending.svg`
- The Word parsing step still fails if the uploaded `.docx` is not a real Word file.
- During testing, fake `.docx` content was used, so `doc_to_md.py` failed normally.
- Even when `doc_to_md.py` fails, MVP SVG pages are still generated and PPT export still succeeds.

## Verified successful export

Verified successful export project:

- Project name: `真导出测试`
- PPT Master project dir:
  - `openclaw-control-center/runtime/app-factory/ppt-master-projects/真导出测试-f6a7f80c_ppt169_20260412`
- Exported files:
  - `openclaw-control-center/runtime/app-factory/ppt-master-projects/真导出测试-f6a7f80c_ppt169_20260412/exports/真导出测试-f6a7f80c_20260412_205015.pptx`
  - `openclaw-control-center/runtime/app-factory/ppt-master-projects/真导出测试-f6a7f80c_ppt169_20260412/exports/真导出测试-f6a7f80c_20260412_205015_svg.pptx`
- Pipeline run log:
  - `openclaw-control-center/runtime/app-factory/projects/真导出测试-f6a7f80c/ppt-master-runs.json`

## Best next steps

1. Replace MVP SVG generation with real content-driven SVG generation from parsed Markdown.
2. Support real `.docx` upload handling end-to-end.
3. Expand from 4 fixed slides to 8-12 auto-planned slides.
4. Add richer chart/card/timeline layouts.
5. Surface exported PPT download links directly in the web UI.

## Resume hint

If resuming later, continue from:
- `openclaw-control-center/scripts/app-factory-preview.cjs`
- `openclaw-control-center/scripts/generate-mvp-svg.cjs`
- `openclaw-control-center/src/app-factory/index.html`
