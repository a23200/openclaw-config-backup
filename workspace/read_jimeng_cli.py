import docx

doc = docx.Document('/Users/mac/Downloads/即梦 CLI 体验指南.docx')
text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
print(text)
