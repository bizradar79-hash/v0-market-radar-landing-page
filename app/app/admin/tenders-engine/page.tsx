"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2, RefreshCw, ExternalLink, Eye, Trash2, X,
  Search, FileText, Globe, Bot, CheckCircle2, XCircle, Clock,
  Plus, Pencil, Upload,
} from "lucide-react"

interface TenderSource {
  id: string
  name: string
  source_type: string
  config: any
  enabled: boolean
  last_scanned_at: string | null
  last_scan_status: string | null
  last_error: string | null
  total_tenders_found: number
}

interface TenderPoolItem {
  id: string
  source_id: string
  external_id: string
  title: string
  description: string | null
  publisher: string | null
  category: string | null
  publish_date: string | null
  deadline: string | null
  url: string | null
  budget: string | null
  location: string | null
  contact_info: any
  status: string
  raw_data: any
  scraped_at: string
}

const SOURCE_ICONS: Record<string, typeof FileText> = {
  scraper: Globe,
  pdf: FileText,
  api: Bot,
}

const CATEGORY_COLORS: Record<string, string> = {
  'שירותים ציבוריים': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'רשויות מקומיות': 'bg-green-500/20 text-green-400 border-green-500/30',
  'חברות ציבוריות': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'מכרזים ציבוריים': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return dateStr }
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'לא נסרק'
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'לפני פחות משעה'
  if (hours < 24) return `לפני ${hours} שעות`
  const days = Math.floor(hours / 24)
  return `לפני ${days} ימים`
}

// ── Source Modal ──────────────────────────────────────────────────────────────
function SourceModal({ source, onClose, onSave }: {
  source: TenderSource | null  // null = new
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [name, setName] = useState(source?.name || '')
  const [sourceType, setSourceType] = useState(source?.source_type || 'scraper')
  const [configJson, setConfigJson] = useState(
    source?.config ? JSON.stringify(source.config, null, 2) : '{\n  "scraper": "ai_search",\n  "queries": []\n}'
  )
  const [enabled, setEnabled] = useState(source?.enabled !== false)
  const [saving, setSaving] = useState(false)
  const [configError, setConfigError] = useState('')

  const handleSave = async () => {
    let config: any
    try {
      config = JSON.parse(configJson)
      setConfigError('')
    } catch {
      setConfigError('JSON לא תקין')
      return
    }
    setSaving(true)
    try {
      await onSave({
        ...(source ? { id: source.id } : {}),
        name,
        source_type: sourceType,
        config,
        enabled,
      })
      onClose()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{source ? 'עריכת מקור' : 'הוספת מקור חדש'}</h2>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-3">
          <div>
            <Label>שם</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder='מכרזי אוניברסיטאות' />
          </div>

          <div>
            <Label>סוג מקור</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scraper">Scraper (סורק אתרים)</SelectItem>
                <SelectItem value="pdf">PDF (ניתוח מסמכים)</SelectItem>
                <SelectItem value="api">API (חיפוש AI)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>הגדרות (JSON)</Label>
            <Textarea
              value={configJson}
              onChange={e => setConfigJson(e.target.value)}
              className="font-mono text-xs h-32"
              dir="ltr"
            />
            {configError && <p className="text-xs text-red-400 mt-1">{configError}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              {sourceType === 'scraper' && 'דוגמה: {"scraper": "mr_gov", "base_url": "..."}'}
              {sourceType === 'pdf' && 'דוגמה: {"scraper": "mashcal_pdf", "list_url": "..."}'}
              {sourceType === 'api' && 'דוגמה: {"scraper": "ai_search", "queries": ["מכרזי בנקים 2026"]}'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label>פעיל</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || !name} className="flex-1">
            {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            {source ? 'שמור שינויים' : 'הוסף מקור'}
          </Button>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TendersEnginePage() {
  const { toast } = useToast()
  const [sources, setSources] = useState<TenderSource[]>([])
  const [tenders, setTenders] = useState<TenderPoolItem[]>([])
  const [stats, setStats] = useState({ open: 0, closed: 0, newThisWeek: 0 })
  const [loading, setLoading] = useState(true)
  const [scanningSource, setScanningSource] = useState<string | null>(null)

  // Filters
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [deadlineFilter, setDeadlineFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  // Detail panel
  const [selectedTender, setSelectedTender] = useState<TenderPoolItem | null>(null)

  // Scan logs
  const [scanLogs, setScanLogs] = useState<string[] | null>(null)

  // PDF upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadSourceId, setUploadSourceId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Source modal
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [editingSource, setEditingSource] = useState<TenderSource | null>(null)

  // Sort
  const [sortField, setSortField] = useState<'deadline' | 'publish_date' | 'title' | 'publisher'>('deadline')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tenders-engine/scan')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSources(data.sources || [])
      setTenders(data.tenders || [])
      setStats(data.stats || { open: 0, closed: 0, newThisWeek: 0 })
    } catch (err: any) {
      toast({ title: 'שגיאה', description: err?.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleScan = async (sourceId?: string) => {
    setScanningSource(sourceId || 'all')
    try {
      const res = await fetch('/api/admin/tenders-engine/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceId ? { source_id: sourceId } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      // Collect all logs from all scanned sources
      const allLogs: string[] = []
      for (const r of data.results || []) {
        if (r.logs) allLogs.push(...r.logs)
      }
      if (allLogs.length > 0) setScanLogs(allLogs)

      toast({
        title: 'סריקה הושלמה',
        description: data.results?.map((r: any) => `${r.source}: ${r.found ?? 0} נמצאו`).join(', '),
      })
      await fetchData()
    } catch (err: any) {
      toast({ title: 'שגיאה בסריקה', description: err?.message, variant: 'destructive' })
    } finally {
      setScanningSource(null)
    }
  }

  const handleDeleteTender = async (id: string) => {
    try {
      const res = await fetch('/api/admin/tenders-engine/scan', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setTenders(prev => prev.filter(t => t.id !== id))
      setSelectedTender(null)
      toast({ title: 'נמחק בהצלחה' })
    } catch (err: any) {
      toast({ title: 'שגיאה', description: err?.message, variant: 'destructive' })
    }
  }

  const handleSaveSource = async (data: any) => {
    const isEdit = !!data.id
    const res = await fetch('/api/admin/tenders-engine/sources', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.error || 'Save failed')
    toast({ title: isEdit ? 'מקור עודכן' : 'מקור נוסף בהצלחה' })
    await fetchData()
  }

  const handleDeleteSource = async (id: string) => {
    if (!confirm('למחוק מקור זה וכל המכרזים שלו?')) return
    try {
      const res = await fetch(`/api/admin/tenders-engine/sources?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast({ title: 'מקור נמחק' })
      await fetchData()
    } catch (err: any) {
      toast({ title: 'שגיאה', description: err?.message, variant: 'destructive' })
    }
  }

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadSourceId) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('source_id', uploadSourceId)
      const res = await fetch('/api/admin/tenders-engine/upload-pdf', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      if (data.logs?.length) setScanLogs(data.logs)
      toast({
        title: 'PDF עובד בהצלחה',
        description: `${data.parsed} מכרזים נמצאו, ${data.saved} נשמרו`,
      })
      await fetchData()
    } catch (err: any) {
      toast({ title: 'שגיאה בהעלאת PDF', description: err?.message, variant: 'destructive' })
    } finally {
      setUploading(false)
      setUploadSourceId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Filter and sort tenders
  const today = new Date().toISOString().split('T')[0]
  let filtered = tenders.filter(t => {
    if (tab === 'open') return t.status === 'open' && (!t.deadline || t.deadline >= today)
    return t.status === 'closed' || (t.deadline && t.deadline < today)
  })

  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.publisher || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    )
  }
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(t => t.category === categoryFilter)
  }
  if (sourceFilter !== 'all') {
    filtered = filtered.filter(t => t.source_id === sourceFilter)
  }
  if (deadlineFilter !== 'all') {
    const now = new Date()
    if (deadlineFilter === 'week') {
      const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]
      filtered = filtered.filter(t => t.deadline && t.deadline <= weekEnd)
    } else if (deadlineFilter === 'month') {
      const monthEnd = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0]
      filtered = filtered.filter(t => t.deadline && t.deadline <= monthEnd)
    }
  }

  filtered.sort((a, b) => {
    const aVal = a[sortField] || ''
    const bVal = b[sortField] || ''
    return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
  })

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sourceMap = Object.fromEntries(sources.map(s => [s.id, s]))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 relative" dir="rtl">
      {/* Hidden file input for PDF upload */}
      <input
        type="file"
        accept="application/pdf"
        ref={fileInputRef}
        className="hidden"
        onChange={handleUploadPdf}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">מנוע מכרזים</h1>
          <p className="text-sm text-muted-foreground mt-1">
            סה״כ {stats.open} מכרזים פעילים | {stats.closed} סגורים | {stats.newThisWeek} חדשים השבוע
          </p>
        </div>
        <Button
          onClick={() => handleScan()}
          disabled={scanningSource !== null}
        >
          {scanningSource === 'all' ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <RefreshCw className="h-4 w-4 ml-2" />}
          סרוק הכל
        </Button>
      </div>

      {/* Source status cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">מקורות סריקה</h2>
          <Button size="sm" variant="outline" onClick={() => { setEditingSource(null); setSourceModalOpen(true) }}>
            <Plus className="h-3.5 w-3.5 ml-1" />
            הוסף מקור
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sources.map(source => {
            const Icon = SOURCE_ICONS[source.source_type] || Globe
            const isScanning = scanningSource === source.id
            return (
              <div key={source.id} className={`rounded-xl border bg-card p-4 space-y-3 ${source.enabled ? 'border-border' : 'border-border/50 opacity-60'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-sm">{source.name}</span>
                    {!source.enabled && <Badge variant="secondary" className="text-xs">מושבת</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => { setEditingSource(source); setSourceModalOpen(true) }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-300"
                      onClick={() => handleDeleteSource(source.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    {source.last_scan_status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {source.last_scan_status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                    {source.last_scan_status === 'running' && <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />}
                    {!source.last_scan_status && <Clock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>סריקה אחרונה: {formatRelativeTime(source.last_scanned_at)}</div>
                  <div>סה״כ מכרזים: {source.total_tenders_found}</div>
                  {source.last_error && (
                    <div className="text-red-400 truncate" title={source.last_error}>
                      שגיאה: {source.last_error}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleScan(source.id)}
                    disabled={isScanning || scanningSource !== null}
                  >
                    {isScanning ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : <RefreshCw className="h-3 w-3 ml-1" />}
                    סרוק עכשיו
                  </Button>
                  {source.source_type === 'pdf' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setUploadSourceId(source.id); fileInputRef.current?.click() }}
                      disabled={uploading}
                    >
                      {uploading && uploadSourceId === source.id
                        ? <Loader2 className="h-3 w-3 ml-1 animate-spin" />
                        : <Upload className="h-3 w-3 ml-1" />
                      }
                      העלה PDF
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab('open')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'open' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          פעילים ({stats.open})
        </button>
        <button
          onClick={() => setTab('closed')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'closed' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          סגורים ({stats.closed})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי כותרת, מפרסם, תיאור..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="קטגוריה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="שירותים ציבוריים">שירותים ציבוריים</SelectItem>
            <SelectItem value="רשויות מקומיות">רשויות מקומיות</SelectItem>
            <SelectItem value="מכרזים ציבוריים">מכרזים ציבוריים</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deadlineFilter} onValueChange={setDeadlineFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="תאריך הגשה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="week">השבוע</SelectItem>
            <SelectItem value="month">החודש</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="מקור" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל המקורות</SelectItem>
            {sources.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-right p-3 font-medium cursor-pointer hover:text-primary" onClick={() => handleSort('title')}>
                  נושא המכרז {sortField === 'title' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-right p-3 font-medium cursor-pointer hover:text-primary" onClick={() => handleSort('publisher')}>
                  מפרסם {sortField === 'publisher' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-right p-3 font-medium">קטגוריה</th>
                <th className="text-right p-3 font-medium cursor-pointer hover:text-primary" onClick={() => handleSort('publish_date')}>
                  תאריך פרסום {sortField === 'publish_date' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-right p-3 font-medium cursor-pointer hover:text-primary" onClick={() => handleSort('deadline')}>
                  תאריך הגשה {sortField === 'deadline' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-right p-3 font-medium">מקור</th>
                <th className="text-right p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    לא נמצאו מכרזים
                  </td>
                </tr>
              ) : (
                filtered.map(tender => {
                  const days = tender.deadline ? daysUntil(tender.deadline) : null
                  const source = sourceMap[tender.source_id]
                  const catColor = CATEGORY_COLORS[tender.category || ''] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'

                  return (
                    <tr
                      key={tender.id}
                      className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedTender(tender)}
                    >
                      <td className="p-3 max-w-[300px]">
                        <span className="truncate block" title={tender.title}>{tender.title}</span>
                      </td>
                      <td className="p-3 text-muted-foreground">{tender.publisher || '—'}</td>
                      <td className="p-3">
                        {tender.category && (
                          <Badge variant="outline" className={`text-xs ${catColor}`}>
                            {tender.category}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{formatDate(tender.publish_date)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span>{formatDate(tender.deadline)}</span>
                          {days !== null && days >= 0 && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                days < 7 ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                days < 30 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                                'bg-green-500/20 text-green-400 border-green-500/30'
                              }`}
                            >
                              {days === 0 ? 'היום' : `${days} ימים`}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {source?.name || '—'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          {tender.url && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                              <a href={tender.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedTender(tender)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => handleDeleteTender(tender.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail slide-in panel */}
      {selectedTender && (
        <div className="fixed inset-y-0 left-0 w-full max-w-lg bg-card border-r border-border shadow-2xl z-50 overflow-y-auto">
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">פרטי מכרז</h2>
              <Button size="icon" variant="ghost" onClick={() => setSelectedTender(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-muted-foreground">כותרת</label>
                <p className="font-medium">{selectedTender.title}</p>
              </div>
              {selectedTender.publisher && (
                <div>
                  <label className="text-xs text-muted-foreground">מפרסם</label>
                  <p>{selectedTender.publisher}</p>
                </div>
              )}
              {selectedTender.description && (
                <div>
                  <label className="text-xs text-muted-foreground">תיאור</label>
                  <p className="whitespace-pre-wrap">{selectedTender.description}</p>
                </div>
              )}
              {selectedTender.category && (
                <div>
                  <label className="text-xs text-muted-foreground">קטגוריה</label>
                  <Badge variant="outline" className={CATEGORY_COLORS[selectedTender.category] || ''}>
                    {selectedTender.category}
                  </Badge>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">תאריך פרסום</label>
                  <p>{formatDate(selectedTender.publish_date)}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">תאריך הגשה</label>
                  <p>{formatDate(selectedTender.deadline)}</p>
                </div>
              </div>
              {selectedTender.budget && (
                <div>
                  <label className="text-xs text-muted-foreground">תקציב</label>
                  <p>{selectedTender.budget}</p>
                </div>
              )}
              {selectedTender.url && (
                <div>
                  <label className="text-xs text-muted-foreground">קישור</label>
                  <a href={selectedTender.url} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline break-all block">
                    {selectedTender.url}
                  </a>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">מקור</label>
                <p>{sourceMap[selectedTender.source_id]?.name || selectedTender.source_id}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סטטוס</label>
                <Badge variant={selectedTender.status === 'open' ? 'default' : 'secondary'}>
                  {selectedTender.status === 'open' ? 'פעיל' : 'סגור'}
                </Badge>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">נסרק בתאריך</label>
                <p>{new Date(selectedTender.scraped_at).toLocaleString('he-IL')}</p>
              </div>

              {selectedTender.raw_data && (
                <div>
                  <label className="text-xs text-muted-foreground">נתוני גלם (debug)</label>
                  <pre className="mt-1 p-3 rounded-lg bg-muted/50 text-xs overflow-x-auto max-h-60 whitespace-pre-wrap" dir="ltr">
                    {JSON.stringify(selectedTender.raw_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 border-t border-border">
              {selectedTender.url && (
                <Button asChild className="flex-1">
                  <a href={selectedTender.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 ml-2" />
                    פתח מכרז
                  </a>
                </Button>
              )}
              <Button variant="destructive" onClick={() => handleDeleteTender(selectedTender.id)}>
                <Trash2 className="h-4 w-4 ml-2" />
                מחק
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Scan logs panel */}
      {scanLogs && scanLogs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">לוגי סריקה אחרונה</h3>
            <Button size="sm" variant="ghost" onClick={() => setScanLogs(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <pre className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 max-h-80 overflow-y-auto whitespace-pre-wrap" dir="ltr">
            {scanLogs.join('\n')}
          </pre>
        </div>
      )}

      {/* Source modal */}
      {sourceModalOpen && (
        <SourceModal
          source={editingSource}
          onClose={() => { setSourceModalOpen(false); setEditingSource(null) }}
          onSave={handleSaveSource}
        />
      )}
    </div>
  )
}
