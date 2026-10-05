'use client'

// Rich-text editor for blog articles (Tiptap v3).
//
// The toolbar only offers what the public article can render and what the
// sanitizer keeps: H2/H3 (the page owns the single H1), bold/italic/underline/
// strike, lists, quote, links and images. Anything else would be stripped on
// save, so offering it would just lose the author's work silently.

import { useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Underline, Strikethrough, Heading2, Heading3, List, ListOrdered,
  Quote, Link2, Link2Off, ImagePlus, Undo2, Redo2, RemoveFormatting, Loader2, Minus,
} from 'lucide-react'
import styles from './article.module.css'

interface Props {
  value: string
  onChange: (html: string) => void
  /** Uploads an image file and resolves to its public URL. */
  onUploadImage: (file: File) => Promise<string>
}

export function RichEditor({ value, onChange, onUploadImage }: Props) {
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    // Required with the App Router: render on the client only, otherwise the
    // server and client markup disagree and React throws a hydration error.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: 'כתוב כאן את המאמר…' }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        dir: 'rtl',
        class: `${styles.body} min-h-[420px] px-5 py-4 focus:outline-none`,
        'aria-label': 'תוכן המאמר',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // `value` is read once, as the initial content. The editor page mounts this
  // component only after the post has loaded (keyed by post id), so there is no
  // need to push later changes back in — the editor is the source of truth.

  async function insertImage(file: File) {
    if (!editor) return
    setUploading(true)
    try {
      const url = await onUploadImage(file)
      const alt = window.prompt('טקסט חלופי לתמונה (חשוב לנגישות ול-SEO):', '') || ''
      editor.chain().focus().setImage({ src: url, alt }).run()
    } catch (e: any) {
      window.alert(`העלאת התמונה נכשלה: ${e?.message || 'שגיאה'}`)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function setLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('כתובת הקישור (https://…):', prev || 'https://')
    if (url === null) return
    if (!url.trim() || url.trim() === 'https://') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      window.alert('הקישור חייב להתחיל ב-https:// או mailto:')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  if (!editor) {
    return <div className="flex min-h-[460px] items-center justify-center rounded-lg border"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-background">
      <Toolbar editor={editor} onLink={setLink} onImage={() => fileInput.current?.click()} uploading={uploading} />
      <EditorContent editor={editor} />
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) insertImage(f) }}
      />
    </div>
  )
}

function Toolbar({ editor, onLink, onImage, uploading }: {
  editor: Editor; onLink: () => void; onImage: () => void; uploading: boolean
}) {
  const btn = (active: boolean) =>
    `inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
      active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    } disabled:opacity-40`
  const sep = <span className="mx-1 h-5 w-px bg-border" aria-hidden />

  return (
    <div role="toolbar" aria-label="עיצוב טקסט" className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-2 py-1.5">
      <button type="button" title="כותרת ראשית בגוף המאמר (H2)" aria-label="כותרת H2" className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></button>
      <button type="button" title="כותרת משנה (H3)" aria-label="כותרת H3" className={btn(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></button>
      {sep}
      <button type="button" title="מודגש" aria-label="מודגש" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></button>
      <button type="button" title="נטוי" aria-label="נטוי" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></button>
      <button type="button" title="קו תחתון" aria-label="קו תחתון" className={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline className="h-4 w-4" /></button>
      <button type="button" title="קו חוצה" aria-label="קו חוצה" className={btn(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></button>
      {sep}
      <button type="button" title="רשימה" aria-label="רשימת תבליטים" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></button>
      <button type="button" title="רשימה ממוספרת" aria-label="רשימה ממוספרת" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></button>
      <button type="button" title="ציטוט" aria-label="ציטוט" className={btn(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></button>
      <button type="button" title="קו מפריד" aria-label="קו מפריד" className={btn(false)} onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></button>
      {sep}
      <button type="button" title="הוסף / ערוך קישור" aria-label="קישור" className={btn(editor.isActive('link'))} onClick={onLink}><Link2 className="h-4 w-4" /></button>
      <button type="button" title="הסר קישור" aria-label="הסר קישור" className={btn(false)} disabled={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()}><Link2Off className="h-4 w-4" /></button>
      <button type="button" title="הוסף תמונה" aria-label="הוסף תמונה" className={btn(false)} disabled={uploading} onClick={onImage}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      </button>
      {sep}
      <button type="button" title="נקה עיצוב" aria-label="נקה עיצוב" className={btn(false)} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting className="h-4 w-4" /></button>
      <button type="button" title="בטל" aria-label="בטל" className={btn(false)} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></button>
      <button type="button" title="בצע שוב" aria-label="בצע שוב" className={btn(false)} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></button>
    </div>
  )
}
