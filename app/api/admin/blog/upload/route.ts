export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { blogAdminDb, requireBlogAdmin } from '@/lib/blog/admin-server'

const BUCKET = 'blog'
const MAX_BYTES = 8 * 1024 * 1024

/**
 * Raster formats only. SVG is excluded on purpose: it is XML that can carry
 * script, and these files are served publicly.
 */
const TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/gif': { ext: 'gif', magic: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  'image/webp': {
    ext: 'webp',
    magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
}

/**
 * POST multipart { file } — upload a cover or in-article image to the public
 * `blog` bucket and return its URL.
 *
 * The declared type is not trusted: the file's first bytes must match it, so a
 * renamed HTML/SVG file can't be smuggled in as an "image".
 */
export async function POST(request: Request) {
  const denied = await requireBlogAdmin()
  if (denied) return denied

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'הבקשה לא כוללת קובץ' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 })

  const kind = TYPES[file.type]
  if (!kind) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך — JPG, PNG, WEBP או GIF בלבד' }, { status: 415 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `הקובץ גדול מדי (מקסימום ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length < 12 || !kind.magic(bytes)) {
    return NextResponse.json({ error: 'תוכן הקובץ לא תואם לסוג התמונה' }, { status: 415 })
  }

  // Random name: never reuse the uploaded filename (path tricks, collisions).
  const now = new Date()
  const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(12).toString('hex')}.${kind.ext}`

  const db = blogAdminDb()
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    cacheControl: '31536000', // immutable: every upload gets a fresh name
    upsert: false,
  })
  if (error) {
    const missingBucket = /bucket/i.test(error.message) && /not found/i.test(error.message)
    return NextResponse.json(
      { error: missingBucket ? 'ה-bucket "blog" לא קיים — יש להריץ את supabase/add_blog.sql' : `ההעלאה נכשלה: ${error.message}` },
      { status: 500 },
    )
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl, path })
}
