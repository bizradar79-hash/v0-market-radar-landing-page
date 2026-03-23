"use client"

import { useState } from "react"
import { Plus, X, RefreshCw, ChevronLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import type { BusinessProfile } from "@/types/business-profile"

interface Props {
  profile: BusinessProfile
  onConfirm: (profile: BusinessProfile) => void
  onRetry: () => void
  isConfirming?: boolean
}

function TagEditor({
  label,
  tags,
  onChange,
}: {
  label: string
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [input, setInput] = useState("")

  const add = () => {
    const val = input.trim()
    if (val && !tags.includes(val)) {
      onChange([...tags, val])
    }
    setInput("")
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
              className="mr-1 rounded hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={`הוסף ${label}...`}
          className="bg-background text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!input.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

const BUSINESS_MODEL_LABELS: Record<string, string> = {
  B2B: 'B2B — עסק לעסק',
  B2C: 'B2C — עסק לצרכן',
  B2B2C: 'B2B2C — מעורב',
  mixed: 'מעורב',
}

const STAGE_LABELS: Record<string, string> = {
  startup: 'סטארטאפ',
  growing: 'בצמיחה',
  established: 'מבוסס',
  enterprise: 'ארגוני',
}

export function BusinessProfileConfirmation({ profile, onConfirm, onRetry, isConfirming }: Props) {
  const [coreActivity, setCoreActivity] = useState(profile.coreActivity)
  const [targetAudiences, setTargetAudiences] = useState(profile.targetAudiences)
  const [industryTags, setIndustryTags] = useState(profile.industryTags)
  const [primaryKeywords, setPrimaryKeywords] = useState(profile.primaryKeywords)
  const [directCompetitors, setDirectCompetitors] = useState(profile.directCompetitors)
  const [products, setProducts] = useState(profile.products)

  const removeProduct = (i: number) => setProducts(products.filter((_, idx) => idx !== i))

  const handleConfirm = () => {
    onConfirm({
      ...profile,
      coreActivity,
      targetAudiences,
      industryTags,
      primaryKeywords,
      directCompetitors,
      products,
    })
  }

  const confidenceColor =
    profile.confidenceScore >= 80
      ? "bg-green-100 text-green-800 border-green-200"
      : profile.confidenceScore >= 60
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : "bg-red-100 text-red-800 border-red-200"

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">תוצאות ניתוח AI</h2>
          <p className="mt-1 text-sm text-muted-foreground">בדוק ועדכן את הפרטים לפני שממשיכים</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${confidenceColor}`}>
            רמת ביטחון: {profile.confidenceScore}%
          </span>
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
            {BUSINESS_MODEL_LABELS[profile.businessModel] || profile.businessModel}
          </span>
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
            {STAGE_LABELS[profile.companyStage] || profile.companyStage}
          </span>
        </div>
      </div>

      {/* Core Activity */}
      <div className="space-y-2">
        <Label>פעילות עיקרית</Label>
        <Textarea
          value={coreActivity}
          onChange={e => setCoreActivity(e.target.value)}
          className="min-h-[80px] bg-background text-sm"
          placeholder="תאר את פעילות העסק..."
        />
      </div>

      {/* Products */}
      <div className="space-y-2">
        <Label>מוצרים ושירותים</Label>
        <div className="space-y-2">
          {products.map((p, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {p.targetAudience && (
                    <span className="text-xs text-muted-foreground">👥 {p.targetAudience}</span>
                  )}
                  {p.priceRange && (
                    <span className="text-xs text-muted-foreground">💰 {p.priceRange}</span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeProduct(i)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {products.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">לא זוהו מוצרים</p>
          )}
        </div>
      </div>

      {/* Editable tag sections */}
      <TagEditor label="קהלי יעד" tags={targetAudiences} onChange={setTargetAudiences} />
      <TagEditor label="תגיות תעשייה" tags={industryTags} onChange={setIndustryTags} />
      <TagEditor label="מילות מפתח" tags={primaryKeywords} onChange={setPrimaryKeywords} />
      <TagEditor label="מתחרים שזוהו" tags={directCompetitors} onChange={setDirectCompetitors} />

      {/* Action buttons */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between pt-2 border-t border-border">
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          disabled={isConfirming}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          נתח מחדש
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={isConfirming}
          className="gap-2"
        >
          {isConfirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
          {isConfirming ? 'שומר...' : 'נראה מצוין! המשך'}
        </Button>
      </div>
    </div>
  )
}
