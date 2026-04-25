import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import TurndownService from "turndown";

interface PrdEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
}

const turndown = new TurndownService();

export default function PrdEditor({ markdown, onChange }: PrdEditorProps) {
  const html = useMemo(() => {
    const parsed = marked.parse(markdown || "");
    return typeof parsed === "string" ? parsed : "";
  }, [markdown]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: html,
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(turndown.turndown(currentEditor.getHTML()));
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextHtml = typeof marked.parse(markdown || "") === "string" ? (marked.parse(markdown || "") as string) : "";
    if (nextHtml !== editor.getHTML()) {
      editor.commands.setContent(nextHtml, false);
    }
  }, [editor, markdown]);

  return <EditorContent editor={editor} className="editor-content" />;
}
