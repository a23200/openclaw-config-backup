import docx
doc = docx.Document('/Users/mac/Desktop/副本ClawLink AI产业融合架构.docx')
with open('/Users/mac/.openclaw/workspace/docx_full.txt', 'w') as f:
    f.write("\n".join([p.text for p in doc.paragraphs if p.text.strip()]))
