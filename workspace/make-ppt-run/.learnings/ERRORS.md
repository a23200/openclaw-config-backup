## [ERR-20260413-001] plus_ai_auth_previous_key

**Logged**: 2026-04-13T04:35:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
Previous Plus AI API key returned 401 Unauthorized while the replacement key succeeded with 201 Created.

### Error
```
POST https://api.plusdocs.com/r/v0/presentation
Response: 401 Unauthorized
Body: {"message":"Unauthorized"}
```

### Context
- Operation: minimal Presentations API auth check
- Result: old key invalid/inactive, new key accepted immediately
- Environment: local App Factory integration

### Suggested Fix
When Plus AI returns 401, verify the active API key in the Plus AI dashboard; older keys may have been rotated or deactivated.

### Metadata
- Reproducible: yes
- Related Files: scripts/app-factory-preview.cjs

---
## [ERR-20260415-001] python_pptx_missing_for_ppt_generation

**Logged**: 2026-04-15T01:47:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: scripts

### Summary
`python3 scripts/build_neural_params_gemini_ref_demo.py --reuse-raw` failed because the active Homebrew Python environment had Pillow installed but not `python-pptx`.

### Error
```
ModuleNotFoundError: No module named 'pptx'
```

### Context
- Operation: regenerate the Gemini-reference neural-parameters slide while reusing an existing raw background
- Environment: `/opt/homebrew/bin/python3` 3.14.3
- `PIL` was available, `pptx` was missing

### Suggested Fix
Keep `python-pptx` optional for this script and fall back to cloning the existing one-slide PPTX template while replacing `ppt/media/image1.png`.

### Metadata
- Reproducible: yes
- Related Files: scripts/build_neural_params_gemini_ref_demo.py

---
## [ERR-20260415-002] pep668_blocks_global_pip_install

**Logged**: 2026-04-15T02:03:00+08:00
**Priority**: low
**Status**: resolved
**Area**: scripts

### Summary
Direct `pip install python-pptx` on the Homebrew-managed Python failed because the environment is externally managed under PEP 668.

### Error
```
error: externally-managed-environment
```

### Context
- Operation: install `python-pptx` for local PPT generation
- Environment: Homebrew Python 3.14 with `pip`

### Suggested Fix
Create a repo-local virtual environment and install Python dependencies there instead of modifying the managed global interpreter.

### Metadata
- Reproducible: yes
- Related Files: scripts/build_core_competitiveness_field_demo.py

---
