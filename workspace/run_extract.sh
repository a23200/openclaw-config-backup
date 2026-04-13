#!/bin/bash
python3 -m venv /Users/mac/.openclaw/workspace/pptx_venv
/Users/mac/.openclaw/workspace/pptx_venv/bin/pip install python-docx python-pptx openai markdown2 > /dev/null
/Users/mac/.openclaw/workspace/pptx_venv/bin/python /Users/mac/.openclaw/workspace/extract_office.py
