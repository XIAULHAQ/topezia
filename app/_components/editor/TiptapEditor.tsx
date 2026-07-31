"use client";

/**
 * The WYSIWYG article body, shared by /hq/posts (first-party editorial) and
 * /employer/articles (a company's own writing).
 *
 * Whatever comes out of editor.getHTML() is re-sanitized server-side on every
 * save — sanitizeBlogHtml for /hq, sanitizeUgcHtml for companies (see
 * lib/sanitize.ts, they differ on nofollow and remote images). This component
 * is a display nicety and never the trust boundary, which is exactly why it
 * can be shared by two paths with different trust levels.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";

export default function TiptapEditor({
  value,
  onChange,
  onUploadImage,
}: {
  value: string;
  onChange: (html: string) => void;
  onUploadImage: (file: File) => Promise<{ url: string } | null>;
}) {
  const editor = useEditor({
    // This is a client component, but Next still renders an initial shell —
    // deferring the first render to the client avoids a hydration mismatch.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Image,
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: { attributes: { style: "min-height:360px; outline:none;" } },
  });

  // Hydrate once the record loads async (post-editor fetches by id).
  const hydrated = useRef(false);
  useEffect(() => {
    if (!editor || hydrated.current) return;
    if (value) {
      editor.commands.setContent(value);
      hydrated.current = true;
    }
  }, [editor, value]);

  const fileInput = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  async function insertImage(file: File) {
    const alt = window.prompt("Alt text for this image (describes it for search & accessibility):", "");
    if (alt === null) return; // cancelled — don't insert an image with no chance at alt text
    const result = await onUploadImage(file);
    if (!result) return;
    editor!.chain().focus().setImage({ src: result.url, alt: alt || undefined }).run();
  }

  function addLink() {
    const url = window.prompt("Link URL:");
    if (!url) return;
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div style={S.wrap}>
      <div style={S.toolbar}>
        <ToolBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolBtn>
        <ToolBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolBtn>
        <ToolBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</ToolBtn>
        <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</ToolBtn>
        <ToolBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>&ldquo;&rdquo;</ToolBtn>
        <ToolBtn active={editor.isActive("link")} onClick={addLink}>Link</ToolBtn>
        <ToolBtn active={false} onClick={() => fileInput.current?.click()}>Image</ToolBtn>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) insertImage(f);
          }}
        />
      </div>
      <div style={S.content}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ ...S.tool, ...(active ? S.toolOn : {}) }}>
      {children}
    </button>
  );
}

const S: Record<string, CSSProperties> = {
  // NOTE: no `overflow: hidden` here, and it must stay that way. It was here
  // for the rounded corners, and it silently disabled `position: sticky` on
  // the toolbar — an overflow-hidden ancestor makes a sticky descendant
  // scroll away like any other element. The corners are done on the children
  // instead, which costs nothing.
  wrap: { border: "1px solid #E2E8F0", borderRadius: 14, background: "#fff" },
  // Sticky so formatting is reachable from anywhere in a long article. Before
  // this, bolding a word near the end meant scrolling to the top of the page
  // and back. `top: 0` is right because neither /hq/posts nor
  // /employer/articles renders a fixed header above the editor.
  toolbar: {
    display: "flex", flexWrap: "wrap", gap: 4, padding: 8,
    borderBottom: "1px solid #E2E8F0", background: "#F8FAFC",
    borderRadius: "13px 13px 0 0",
    position: "sticky", top: 0, zIndex: 5,
  },
  tool: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontWeight: 700, color: "#334155", cursor: "pointer", fontFamily: "inherit" },
  toolOn: { background: "#EEF2FF", borderColor: "#C7D2FE", color: "#4F46E5" },
  content: { padding: "16px 18px", fontSize: 15, lineHeight: 1.75, color: "#0F172A" },
};
